/**
 * The narrowing engine. Deterministic — no model call.
 *
 * The model reads free text into a starting profile, ranks which questions are worth asking,
 * rewords them, and explains the result. It never computes what is in here, because a
 * confidence number a model made up is a number that can embarrass us live.
 *
 * `remainingSetups` is INTERNAL as of 03 Sep. The "possible setups" counter came off screen —
 * the meter shows words relevant to the current screen instead — so do not treat that number
 * as a design constraint. `confidence` is still load-bearing: it decides when to stop asking.
 *
 * Three ways a signal can be known, and they are not interchangeable:
 *   tapped     full weight   the person chose an option
 *   prefilled  half weight   we inferred it from their description (may be wrong)
 *   prosaic    half weight   they answered in words no fixed rule can read
 */

import {
  QUESTIONS,
  QUESTION_BY_ID,
  TOTAL_WEIGHT,
  withSurface,
  type Question,
  type SignalId,
  type SurfaceMap,
} from "./questions";
import { discrimination, survivors } from "./candidates";
import { has, type Profile, type ProfileValue } from "./profile";

/* Re-exported so the many existing `from "./engine"` imports keep working. The definitions
   live in profile.ts, a leaf module, so candidates.ts can reach features.ts without a cycle. */
export { has };
export type { Profile, ProfileValue };

/**
 * Starting universe. 5,318 is not decorative — it is the real number of distinct
 * `business_industry` strings in Neo's persona data (13,968 rows). Opening on it and
 * collapsing from there makes the data-quality finding part of the experience rather
 * than a slide, and it is the honest size of the space we are narrowing.
 */
export const STARTING_SETUPS = 5318;

/** Floor, so the counter lands on something concrete rather than 1. */
const FLOOR_SETUPS = 3;

/** Free text a person typed on a question screen, keyed by question id. */
export type FreeTextAnswers = Record<string, string>;

/**
 * One question exactly as a person saw it, and what they did with it.
 *
 * This exists because generated wording makes every session different. Without a trail,
 * "the third question was wrong" is unreproducible: the bank that produced it is gone the
 * moment the tab closes. It also carries `origin`, so a bug report says whether the words
 * came from the model or from the fixed bank — which is the first thing you need to know.
 *
 * Persisted with the rest of the snapshot, so a reload keeps the record.
 */
export interface QuestionTrace {
  id: string;
  signal: SignalId;
  /** "generated" when model wording was applied, "fixed" when it came from questions.ts. */
  origin: "fixed" | "generated";
  /** The prompt as displayed, after any override. */
  prompt: string;
  /** Option ids and the labels as displayed, in order. */
  options: { id: string; label: string }[];
  pickedOptionIds: string[];
  freeText?: string;
  answeredAt: number;
}

export interface EngineState {
  profile: Profile;
  /** Question ids already answered, in order. */
  asked: string[];
  /**
   * Question ids the FREE TEXT already answered, so the engine never asks them.
   *
   * These signals are in `profile` with exactly the values a tap would have produced, so
   * `isResolved` already skips them and nothing downstream can tell the difference. The list
   * is kept separately for two reasons: the guess screen shows what we inferred, so a wrong
   * inference is correctable rather than silently priced; and a log line saying which
   * questions were skipped is the only evidence that the flow is adapting at all.
   *
   * Never contains `team` — mailbox count is never inferred. See profileService's PREFILL.
   */
  prefilled?: string[];
  /**
   * Question ids someone answered in their own words rather than by tapping.
   *
   * Kept apart from `prefilled` because they mean different things: a prefill is a signal we
   * read and RESOLVED to a known value, while this is a signal we asked about and got an
   * answer no fixed rule can read. Both count at half weight, for opposite reasons — one is
   * an inference, the other is knowledge we cannot yet act on.
   *
   * The prose itself lives in `freeText` and in the trail. `/api/rationale` reads it, and once
   * the plan call sees the whole run it is the natural place for this to actually count.
   */
  prosaic?: string[];
  /**
   * The model's ranking of all six questions, most worth asking first.
   *
   * Consumed head-first for the WHOLE flow, not just the first question. The single
   * `nextQuestionId` it replaces was applied once and then discarded, which left questions
   * 2-4 to `nextQuestion`'s weight fallback — a reduce over a fixed array with fixed weights,
   * so every business on earth got team, surface, channel, sells in that order and `import`
   * and `client` were unreachable. This is what makes the paths actually differ.
   */
  priority?: string[];
  /**
   * How many questions had been asked when the plan stopped moving.
   *
   * Everything after this point is asked to improve the feature lines rather than the price,
   * and `FEATURE_ONLY_BUDGET` caps how many of those there may be. Recorded rather than
   * recomputed because it is a fact about the run, and recomputing it would mean replaying
   * every intermediate profile.
   */
  planSettledAt?: number;
  /** Anything typed into a question's free-text box, by question id. */
  freeText: FreeTextAnswers;
  /**
   * Model-written wording, by question id. Validated server-side before it gets here.
   * Absent means every question uses the fixed bank verbatim.
   */
  surface?: SurfaceMap;
  /** What was actually shown and answered, in order. Append-only. */
  trail?: QuestionTrace[];
}

/** A signal counts as resolved once the profile carries a non-null value for it. */
export function isResolved(profile: Profile, signal: SignalId): boolean {
  const v = profile[signal];
  return v !== undefined && v !== null && v !== "";
}

/**
 * How much of the space is closed, with prefilled signals counted at HALF.
 *
 * The discount governs the early stop, and that is a correctness concern rather than a
 * cosmetic one. It was written for the narrowing meter, then dropped on 03 Sep when the meter
 * came off screen and a check said flow length was unaffected. **That check was too narrow.**
 * It compared one path at a prefill cap of 2; it did not cover what actually happens when a
 * description is rich.
 *
 * What happens without it: prefills count full weight, `confidence` starts high, and
 * `shouldReveal` fires at the 0.82 threshold after two questions. A florist whose description
 * resolved three signals was asked `team` and `import` and then sent to the reveal — so
 * `currentClient` was never asked and never known, on a run where we had budget for it. More
 * information in the description made us collect LESS from the person, which is exactly
 * backwards.
 *
 * Half is a judgement, not a measurement: a signal we inferred is worth real confidence but
 * less than one someone tapped, because a tap cannot be misread. Reinstated with the reason
 * corrected — this is about when to stop asking, not about a number on screen.
 */
export function resolvedWeight(
  profile: Profile,
  prefilled?: string[],
  prosaic?: string[],
): number {
  const pre = new Set(prefilled ?? []);
  const pro = new Set(prosaic ?? []);
  return QUESTIONS.reduce((sum, q) => {
    /* Answered in prose: not resolved (no matcher can read it) but genuinely answered, so it
       earns half and is never asked again. Without this the flow would keep asking as though
       the person had said nothing, which is the opposite failure to the one just fixed. */
    if (pro.has(q.id)) return sum + q.weight / 2;
    if (!isResolved(profile, q.signal)) return sum;
    return sum + (pre.has(q.id) ? q.weight / 2 : q.weight);
  }, 0);
}

/**
 * 0–1. Starts above zero because the free-text answer alone tells us a lot — opening the
 * ring at empty after someone has just written a paragraph reads as "you weren't listening".
 */
export function confidence(profile: Profile, prefilled?: string[], prosaic?: string[]): number {
  const base = isResolved(profile, "industry") ? 0.22 : 0.05;
  const earned = (resolvedWeight(profile, prefilled, prosaic) / TOTAL_WEIGHT) * (1 - base);
  return Math.min(0.97, base + earned);
}

/**
 * Remaining possible setups. Decays exponentially against confidence so the early answers
 * feel dramatic (thousands falling away) and later ones feel precise (dozens to a handful) —
 * linear decay reads as a progress bar, which is the opposite of the feeling we want.
 */
export function remainingSetups(
  profile: Profile,
  prefilled?: string[],
  prosaic?: string[],
): number {
  const c = confidence(profile, prefilled, prosaic);
  const value = STARTING_SETUPS * Math.pow(1 - c, 3.2);
  return Math.max(FLOOR_SETUPS, Math.round(value));
}

/**
 * Which question to ask next.
 *
 * `preferredId` is the model's suggestion. We honour it only if it is a real question that
 * is still unresolved — otherwise we fall back to the heaviest unresolved question. The model
 * gets to make the flow feel intelligent; it does not get to break it.
 */
export function nextQuestion(state: EngineState): Question | null {
  const unresolved = QUESTIONS.filter(
    (q) => !isResolved(state.profile, q.signal) && !state.asked.includes(q.id),
  );
  if (unresolved.length === 0) return null;

  /* Choose from the FIXED bank — weights and signals are never model-touched — then overlay
     the model's wording on the winner. Choosing and wording are separate powers on purpose. */
  let chosen: Question | null = null;

  /**
   * The model's ranking, head-first, for the whole flow.
   *
   * Every id is re-checked against `unresolved` here, so a hallucinated id, a duplicate, or a
   * question whose signal the free text already answered is skipped rather than trusted. The
   * model orders; the engine still decides what is askable.
   */
  for (const id of state.priority ?? []) {
    const q = QUESTION_BY_ID.get(id);
    if (q && unresolved.includes(q)) {
      chosen = q;
      break;
    }
  }

  /**
   * Otherwise: whichever question most narrows the field of possible setups.
   *
   * This replaced a `reduce` over fixed weights, which — being a pure function of which
   * signals were resolved — returned the same four questions in the same order for every
   * business alive, and left `import` and `client` permanently unreachable.
   *
   * `discrimination` counts how the surviving candidates split across a question's answers,
   * so the question that most changes the recommendation is asked first. That is the Akinator
   * mechanic, and it is arithmetic rather than a model call.
   *
   * WHY A ZERO SCORE DOES NOT STOP THE FLOW. Once the plan is pinned, the remaining questions
   * score 0 — no answer moves a candidate. It is tempting to stop there, and it would be wrong:
   * `importIntent` and `currentClient` no longer gate any plan (Lite is gone) but they still
   * decide which feature lines appear, so they change the reveal even when they cannot change
   * the price. Weight order takes over, and `shouldReveal` still governs when to stop.
   */
  if (!chosen) {
    /**
     * Rank lexicographically: what changes the PRICE, then what changes the reveal, then the
     * data-derived weight.
     *
     * A single combined score got this wrong and the probe showed it plainly. `client` scores
     * 0.67 on the full outcome because it swaps two feature bullets, while `extras` scores
     * only 0.25 — so a question about which mail app someone uses was asked BEFORE the one
     * that decides whether they need Max. Feature lines outranking a tier is exactly backwards,
     * and it also meant the plan never settled early enough for the feature budget to apply.
     *
     * Separating the two is what makes "ask what matters first" true rather than approximate.
     */
    const score = (q: Question): [number, number, number] => [
      discrimination(state.profile, q, "plan"),
      discrimination(state.profile, q),
      q.weight,
    ];
    let best = unresolved[0];
    let bestScore = score(best);
    for (const q of unresolved.slice(1)) {
      const s2 = score(q);
      const better =
        s2[0] > bestScore[0] + 1e-9 ||
        (Math.abs(s2[0] - bestScore[0]) <= 1e-9 &&
          (s2[1] > bestScore[1] + 1e-9 ||
            (Math.abs(s2[1] - bestScore[1]) <= 1e-9 && s2[2] > bestScore[2])));
      if (better) {
        best = q;
        bestScore = s2;
      }
    }
    chosen = best;
  }

  return withSurface(chosen, state.surface);
}

/**
 * The hard ceiling. Nobody is asked more than this, whatever the engine wants.
 *
 * Raised from 4 to 12 on 03 Sep, at Hari's call, alongside the six questions that make Max
 * and Growth reachable — the two decisions are really one, because a 4x price jump cannot be
 * justified on four answers.
 *
 * **It is a ceiling and should almost never bind.** `shouldReveal` stops as soon as no
 * remaining question could change the recommendation, so a clear-cut business finishes in
 * three or four and only a genuinely ambiguous one walks further. Prefill removes questions
 * someone already answered in prose before we start.
 *
 * The risk this accepts, stated plainly: docs/competitor-qualification.md puts quiz completion
 * at **40-65%**, Mailchimp asks 4, Rinda 3, and Microsoft's chooser 7 — so 12 is above
 * everything observed anywhere. That is why the run record exists. Per-question drop-off is
 * now measurable in runs.jsonl, and this number should be revisited against that data rather
 * than against anyone's instinct.
 */
export const MAX_QUESTIONS = 12;

/**
 * Never reveal before this many, even if nothing discriminates.
 *
 * Two is too few: one answer after the free text reads as a guess rather than a diagnosis, and
 * the whole premise is that we worked it out. Three is the floor at which the flow feels like
 * it asked.
 */
const MIN_QUESTIONS = 3;

/**
 * How many questions may be asked purely to improve the FEATURE lines, once nothing left can
 * change the plan or the price.
 *
 * Two, and the number is not arbitrary: `pickFeatures` renders exactly two bullets, so a third
 * feature-only question cannot change anything a person reads. Without this bound every flow
 * ran to eight — three extra questions bought two better lines, which is a poor trade against
 * the 40-65% quiz completion in docs/competitor-qualification.md.
 */
const FEATURE_ONLY_BUDGET = 2;

/**
 * Setups still standing. Exposed so the reveal and the run record can report the real
 * narrowing rather than a decayed weight.
 */
export function viableSetups(state: EngineState): number {
  return survivors(state.profile).length;
}

/**
 * When to stop asking.
 *
 * The rule that matters is the middle one: **stop when no remaining question could change the
 * recommendation.** That is a statement about the outcome, which is what someone actually
 * cares about, and it replaced a confidence threshold that only measured how much we happened
 * to have asked. With twelve questions in the bank it is also what keeps the flow short — a
 * business where three answers settle the plan is not walked through nine more.
 *
 * THE CONFIDENCE BACKSTOP WAS REMOVED, and the probe is why. With it, the rule fell through
 * to `confidence >= 0.82` whenever something still discriminated — so a phone-and-walk-in
 * business was revealed at five questions **without ever being asked how customers reach
 * them**, which is the one answer that decides Basic against Plus. It got Plus and a ₹90/month
 * surcharge because we stopped early on a number that measured how much we had asked rather
 * than whether the answer could still move.
 *
 * A threshold that can silence a question capable of changing the price is not a backstop, it
 * is a bug. The only stopping rules left are: nothing to ask, nothing worth asking, or the
 * hard ceiling. The bank holds nine questions, so the worst case is bounded well under
 * MAX_QUESTIONS anyway.
 */
export function shouldReveal(state: EngineState): boolean {
  if (nextQuestion(state) === null) return true;
  if (state.asked.length >= MAX_QUESTIONS) return true;
  if (state.asked.length < MIN_QUESTIONS) return false;

  /* Nothing left that would move the plan. Anything still unasked only colours the reveal, so
     asking it is drop-off we caused for no change in what we recommend. */
  const unresolved = QUESTIONS.filter(
    (q) => !isResolved(state.profile, q.signal) && !state.asked.includes(q.id),
  );
  /* Anything left that would change the PLAN is always worth asking — that is what they pay. */
  if (unresolved.some((q) => discrimination(state.profile, q, "plan") > 1e-9)) return false;

  /**
   * Nothing moves the price any more. What remains can still change which feature lines
   * appear, which is worth a couple of questions and no more — the reveal shows two bullets,
   * so a third feature-only answer changes nothing anyone reads.
   *
   * `planSettledAt` is where the price stopped moving; everything asked after it was for the
   * reveal's benefit.
   */
  const featureOnlyAsked = state.asked.length - (state.planSettledAt ?? state.asked.length);
  if (featureOnlyAsked >= FEATURE_ONLY_BUDGET) return true;

  return !unresolved.some((q) => discrimination(state.profile, q) > 1e-9);
}

/**
 * Apply one or more selected options, plus any free text.
 *
 * Multi-select merges values into an array under the same key rather than letting the last
 * click win — "Gmail and Outlook" has to survive as both, or the whole point of allowing it
 * is lost. Single-select keeps the scalar so existing consumers stay simple.
 */
export function applyAnswer(
  state: EngineState,
  questionId: string,
  optionIds: string[],
  freeText?: string,
): EngineState {
  const q = QUESTION_BY_ID.get(questionId);
  if (!q) return state;

  const chosen = q.options.filter((o) => optionIds.includes(o.id));
  const profile: Profile = { ...state.profile };

  for (const opt of chosen) {
    for (const [k, v] of Object.entries(opt.resolves)) {
      if (!q.multi) {
        profile[k] = v;
        continue;
      }
      const prev = profile[k];
      if (Array.isArray(prev)) {
        if (!prev.includes(String(v))) profile[k] = [...prev, String(v)];
      } else if (prev === undefined || prev === null) {
        profile[k] = [String(v)];
      } else {
        profile[k] = [String(prev), String(v)];
      }
    }
  }

  /**
   * Free text does NOT go into the signal slot, and that is a deliberate reversal.
   *
   * It used to: `profile[q.signal] = typed`. So someone who typed "we sell at weekend
   * markets" got `profile.customerChannel = "we sell at weekend markets"`, and then every
   * matcher in rules.ts and features.ts asked `has(profile, "customerChannel", "social")` —
   * comparing prose against a fixed enum, which is **false every time**. The answer resolved
   * the signal, counted toward confidence, stopped the question being asked again, and
   * changed nothing about the plan, the features or the price.
   *
   * Worse than dead weight, it was dishonest in two directions: we acted more confident than
   * we were, and the prose still reached `/api/rationale` through the trail — so the reveal
   * could cite "weekend markets" while the plan underneath had been computed as if they had
   * said nothing at all.
   *
   * So: the prose is kept (in `freeText` and in the trail, where the plan call reads it), the
   * question is not asked again (it is in `asked`), and the signal stays genuinely unresolved
   * so no matcher silently mis-fires. `prosaic` records it, and `resolvedWeight` counts it at
   * half — we learned something real, just not something a fixed rule can act on.
   */
  const typed = freeText?.trim();
  const answeredInProse = Boolean(typed) && chosen.length === 0;

  /* Record what was actually on screen, not what the fixed bank says — the two differ
     whenever the model reworded it, and the displayed version is the one a person can
     report a problem with. */
  const shown = withSurface(q, state.surface);
  const trace: QuestionTrace = {
    id: q.id,
    signal: q.signal,
    origin: state.surface?.[q.id] ? "generated" : "fixed",
    prompt: shown.prompt,
    options: shown.options.map((o) => ({ id: o.id, label: o.label })),
    pickedOptionIds: optionIds,
    ...(typed ? { freeText: typed } : {}),
    answeredAt: Date.now(),
  };

  return {
    /* Spread state first: `surface` and `trail` must survive every answer, and rebuilding
       this object field-by-field is how they would quietly stop doing so. */
    ...state,
    profile,
    asked: [...state.asked, questionId],
    /* Stamp the moment the price stopped moving, once. */
    ...(state.planSettledAt === undefined &&
    !QUESTIONS.some(
      (q) =>
        !isResolved(profile, q.signal) &&
        ![...state.asked, questionId].includes(q.id) &&
        discrimination(profile, q, "plan") > 1e-9,
    )
      ? { planSettledAt: state.asked.length + 1 }
      : {}),
    ...(answeredInProse ? { prosaic: [...(state.prosaic ?? []), questionId] } : {}),
    freeText: typed ? { ...state.freeText, [questionId]: typed } : state.freeText,
    trail: [...(state.trail ?? []), trace],
  };
}

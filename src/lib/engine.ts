/**
 * The narrowing engine. Deterministic — no model call.
 *
 * The model's only jobs are (a) read the free text into a starting profile and (b) suggest
 * which question to ask next. Everything the user *sees* narrowing is computed here, because
 * a confidence number that the model made up is a number that can embarrass us live.
 *
 * Gamification comes from making the narrowing visible: a ring that fills, and a count of
 * remaining possible setups that visibly collapses. Akinator works because you watch it
 * close in on you — a form with nice animation does not do that.
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

/**
 * Starting universe. 5,318 is not decorative — it is the real number of distinct
 * `business_industry` strings in Neo's persona data (13,968 rows). Opening on it and
 * collapsing from there makes the data-quality finding part of the experience rather
 * than a slide, and it is the honest size of the space we are narrowing.
 */
export const STARTING_SETUPS = 5318;

/** Floor, so the counter lands on something concrete rather than 1. */
const FLOOR_SETUPS = 3;

/**
 * Profile values.
 *
 * A value may be an ARRAY once multi-select questions landed — someone can genuinely take
 * orders on Instagram *and* over the phone. Never compare a profile value with `===` directly;
 * use `has()` below, which handles both shapes.
 */
export type ProfileValue = string | number | boolean | null | string[];
export type Profile = Record<string, ProfileValue>;

/**
 * Does this profile hold `value` for `key`?
 *
 * The one place that knows a value might be scalar or array. Every matcher in features.ts and
 * rules.ts goes through this — a stray `p.customerChannel === "social"` silently stops matching
 * the moment that question becomes multi-select, and nothing fails loudly to tell you.
 */
export function has(p: Profile, key: string, value: unknown): boolean {
  const v = p[key];
  return Array.isArray(v) ? v.includes(value as string) : v === value;
}

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
   * The model's ranking of all six questions, most worth asking first.
   *
   * Consumed head-first for the WHOLE flow, not just the first question. The single
   * `nextQuestionId` it replaces was applied once and then discarded, which left questions
   * 2-4 to `nextQuestion`'s weight fallback — a reduce over a fixed array with fixed weights,
   * so every business on earth got team, surface, channel, sells in that order and `import`
   * and `client` were unreachable. This is what makes the paths actually differ.
   */
  priority?: string[];
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
export function resolvedWeight(profile: Profile, prefilled?: string[]): number {
  const pre = new Set(prefilled ?? []);
  return QUESTIONS.filter((q) => isResolved(profile, q.signal)).reduce(
    (sum, q) => sum + (pre.has(q.id) ? q.weight / 2 : q.weight),
    0,
  );
}

/**
 * 0–1. Starts above zero because the free-text answer alone tells us a lot — opening the
 * ring at empty after someone has just written a paragraph reads as "you weren't listening".
 */
export function confidence(profile: Profile, prefilled?: string[]): number {
  const base = isResolved(profile, "industry") ? 0.22 : 0.05;
  const earned = (resolvedWeight(profile, prefilled) / TOTAL_WEIGHT) * (1 - base);
  return Math.min(0.97, base + earned);
}

/**
 * Remaining possible setups. Decays exponentially against confidence so the early answers
 * feel dramatic (thousands falling away) and later ones feel precise (dozens to a handful) —
 * linear decay reads as a progress bar, which is the opposite of the feeling we want.
 */
export function remainingSetups(profile: Profile, prefilled?: string[]): number {
  const c = confidence(profile, prefilled);
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
   * Fallback: heaviest unresolved question.
   *
   * Worth knowing what this alone produces, because it WAS the whole selection logic until
   * 03 Sep: a reduce over a fixed array with fixed weights returns the same answer every
   * time, so every business got team, surface, channel, sells in that order and `import` and
   * `client` were unreachable at MAX_QUESTIONS = 4. It is a sane default for when the model
   * had no opinion; it is not adaptivity, and it should not be the common path.
   */
  if (!chosen) {
    chosen = unresolved.reduce((best, q) => (q.weight > best.weight ? q : best), unresolved[0]);
  }
  return withSurface(chosen, state.surface);
}

/**
 * When to stop asking.
 *
 * Ceiling, not a target. Every question on a pre-purchase page is a place to drop off, so we
 * stop as soon as we know enough rather than marching to a fixed count — which is also more
 * faithful to the idea: it stops when it's got you, not when it runs out of script.
 *
 * Four rather than three: three leaves half the six-question bank unresolved, so the plan,
 * domain and feature picks rest on less than they could, and the narrowing — the whole
 * mechanic — is over in one big jump. Four is the most we can ask before it reads as a form.
 * Keep HOOK_COPY in brand.ts in step with this number.
 */
export const MAX_QUESTIONS = 4;

/**
 * Early exit. Above this we have enough signal that another question would be asking for
 * the sake of it — the recommendation wouldn't change.
 */
const CONFIDENT_ENOUGH = 0.82;

export function shouldReveal(state: EngineState): boolean {
  if (nextQuestion(state) === null) return true;
  if (state.asked.length >= MAX_QUESTIONS) return true;
  // Never cut it off before two — one answer after the free text feels like it guessed.
  return state.asked.length >= 2 && confidence(state.profile, state.prefilled) >= CONFIDENT_ENOUGH;
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

  /* Free text alone resolves the signal too. Someone who skips the options and types
     "we sell at weekend markets" has told us more than any option would have, and the
     engine must not ask the same question again. */
  const typed = freeText?.trim();
  if (typed && chosen.length === 0) profile[q.signal] = typed;

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
    freeText: typed ? { ...state.freeText, [questionId]: typed } : state.freeText,
    trail: [...(state.trail ?? []), trace],
  };
}

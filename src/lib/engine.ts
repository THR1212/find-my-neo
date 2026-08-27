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

import { QUESTIONS, QUESTION_BY_ID, TOTAL_WEIGHT, type Question, type SignalId } from "./questions";

/**
 * Starting universe. 5,318 is not decorative — it is the real number of distinct
 * `business_industry` strings in Neo's persona data (13,968 rows). Opening on it and
 * collapsing from there makes the data-quality finding part of the experience rather
 * than a slide, and it is the honest size of the space we are narrowing.
 */
export const STARTING_SETUPS = 5318;

/** Floor, so the counter lands on something concrete rather than 1. */
const FLOOR_SETUPS = 3;

export type Profile = Record<string, string | number | boolean | null>;

export interface EngineState {
  profile: Profile;
  /** Question ids already answered, in order. */
  asked: string[];
}

/** A signal counts as resolved once the profile carries a non-null value for it. */
export function isResolved(profile: Profile, signal: SignalId): boolean {
  const v = profile[signal];
  return v !== undefined && v !== null && v !== "";
}

export function resolvedWeight(profile: Profile): number {
  return QUESTIONS.filter((q) => isResolved(profile, q.signal)).reduce(
    (sum, q) => sum + q.weight,
    0,
  );
}

/**
 * 0–1. Starts above zero because the free-text answer alone tells us a lot — opening the
 * ring at empty after someone has just written a paragraph reads as "you weren't listening".
 */
export function confidence(profile: Profile): number {
  const base = isResolved(profile, "industry") ? 0.22 : 0.05;
  const earned = (resolvedWeight(profile) / TOTAL_WEIGHT) * (1 - base);
  return Math.min(0.97, base + earned);
}

/**
 * Remaining possible setups. Decays exponentially against confidence so the early answers
 * feel dramatic (thousands falling away) and later ones feel precise (dozens to a handful) —
 * linear decay reads as a progress bar, which is the opposite of the feeling we want.
 */
export function remainingSetups(profile: Profile): number {
  const c = confidence(profile);
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
export function nextQuestion(state: EngineState, preferredId?: string | null): Question | null {
  const unresolved = QUESTIONS.filter(
    (q) => !isResolved(state.profile, q.signal) && !state.asked.includes(q.id),
  );
  if (unresolved.length === 0) return null;

  if (preferredId) {
    const preferred = QUESTION_BY_ID.get(preferredId);
    if (preferred && unresolved.includes(preferred)) return preferred;
  }
  return unresolved.reduce((best, q) => (q.weight > best.weight ? q : best), unresolved[0]);
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
  return state.asked.length >= 2 && confidence(state.profile) >= CONFIDENT_ENOUGH;
}

export function applyAnswer(
  state: EngineState,
  questionId: string,
  optionId: string,
): EngineState {
  const q = QUESTION_BY_ID.get(questionId);
  const opt = q?.options.find((o) => o.id === optionId);
  if (!q || !opt) return state;
  return {
    profile: { ...state.profile, ...opt.resolves },
    asked: [...state.asked, questionId],
  };
}

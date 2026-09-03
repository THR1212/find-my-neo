/**
 * What we know about a business, and the one safe way to read it.
 *
 * A LEAF MODULE ON PURPOSE — it imports nothing. This existed inside `engine.ts` until 03 Sep,
 * which was fine until `candidates.ts` needed to know which feature lines a hypothetical answer
 * would produce. That import (candidates -> features -> engine -> candidates) is a cycle, and
 * the honest fix is not to route around it but to notice that `Profile` and `has` are not
 * engine concepts at all: they are the vocabulary every other module shares.
 *
 * `engine.ts` re-exports both, so existing imports keep working.
 */

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
 * candidates.ts goes through this — a stray `p.customerChannel === "social"` silently stops
 * matching the moment that question becomes multi-select, and nothing fails loudly to tell you.
 */
export function has(p: Profile, key: string, value: unknown): boolean {
  const v = p[key];
  return Array.isArray(v) ? v.includes(value as string) : v === value;
}

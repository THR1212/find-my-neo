/**
 * Per-visitor session persistence.
 *
 * Why this exists: a refresh used to drop everything — the profile, every answer, and Neo's
 * generated site. That was survivable while questions came from a fixed local bank and the
 * only cost was retyping. It stops being survivable the moment questions are generated per
 * session, because then a refresh means paying for every generation again AND sitting through
 * Neo's 22–38s generator a second time. On venue wifi, in front of judges, that is the
 * difference between a recoverable fat-finger and a dead demo.
 *
 * sessionStorage, not localStorage, deliberately. This is "don't lose my place", not
 * "remember me next week". A new tab should start clean, and a profile silently restoring
 * days later is worse than no restore at all.
 *
 * Nothing here is load-bearing. Every read and write is wrapped: private-mode browsers and
 * quota-full storage both throw on plain property access, and a convenience cache must never
 * be the thing that breaks the flow.
 */

import type { EngineState } from "./engine";
import type { NeoSite } from "./neoSite";
import type { RevealContent } from "./session";

/** Where the flow is. Lives here rather than in App so the snapshot type can name it. */
export type Stage = "hook" | "describe" | "guess" | "question" | "reveal";

const KEY = "findmyneo.session";

/**
 * Bump this whenever the snapshot shape changes — and also whenever anything a live snapshot
 * *references* changes: question ids, signal ids, MAX_QUESTIONS. A version mismatch discards
 * the snapshot instead of deserialising yesterday's shape into today's fields, which fails
 * silently and looks like an engine bug.
 */
const VERSION = 2;
/* v2: EngineState gained `surface` (model-written wording) and `trail` (what was shown).
   Both live inside `engine`, so they ride along in the snapshot automatically — but a v1
   snapshot restored into v2 would have neither, and every question would silently revert to
   fixed wording mid-run. Discarding is cheaper to reason about than half-restoring. */

/**
 * RESOLVED 02 Sep — kept because the reasoning still governs the design.
 *
 * `engine.asked` stores question *ids*, not questions. That round-trips today only because
 * QUESTIONS is a static import with stable ids, so a restored id always resolves.
 *
 * The moment questions are generated per session, it stops being true: a reload restores
 * `asked: ["q_a1b2"]` against a bank that no longer contains it, `nextQuestion` returns null,
 * and `{stage === "question" && current && ...}` in App renders NOTHING. A blank screen with
 * no error — which is exactly the failure that has already cost us two rounds of debugging.
 *
 * The answer taken: generation never invents a question id. It only overrides the WORDING of
 * the six fixed ones, and those overrides live in `engine.surface`, which is already part of
 * the snapshot. So every restored id still resolves against the static bank, and a restored
 * run keeps the wording it was shown. This is a large part of why the surface-override design
 * was chosen over letting the model emit whole questions.
 */

/** Long enough to survive a refresh or a closed lid; short enough that a stale run never returns. */
const TTL_MS = 2 * 60 * 60 * 1000;

export interface Snapshot {
  v: number;
  savedAt: number;
  stage: Stage;
  engine: EngineState;
  rawText: string;
  reveal: RevealContent | null;
  summary: string | null;
  preferredQuestionId: string | null;
  neoSite: NeoSite | null;
}

/** Everything App owns that is worth restoring. `loading` and `error` are deliberately absent. */
export type Restorable = Omit<Snapshot, "v" | "savedAt">;

export function saveSnapshot(s: Restorable): void {
  /* The hook screen holds nothing worth restoring, and writing there would mean a reload of a
     freshly-restarted session resurrects the run the user just cleared. */
  if (s.stage === "hook") return;
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ ...s, v: VERSION, savedAt: Date.now() }));
  } catch {
    /* Private mode, disabled storage, quota. Persistence is optional by design. */
  }
}

/**
 * Read the snapshot back, or null if there is nothing trustworthy to restore.
 *
 * Returns null rather than throwing on every failure mode — wrong version, expired, malformed,
 * storage unavailable — because the correct response to all of them is identical: start fresh.
 */
export function loadSnapshot(): Snapshot | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<Snapshot>;
    if (parsed.v !== VERSION) return null;
    if (typeof parsed.savedAt !== "number" || Date.now() - parsed.savedAt > TTL_MS) return null;

    /* Shape sanity. `asked` is the field the engine indexes into on first render, so if it is
       not an array we would crash before showing anything. */
    if (!parsed.engine || !Array.isArray(parsed.engine.asked) || !parsed.engine.profile) return null;
    if (!parsed.stage || parsed.stage === "hook") return null;
    if (typeof parsed.rawText !== "string") return null;

    return parsed as Snapshot;
  } catch {
    return null;
  }
}

const SID_KEY = "findmyneo.sid";

/**
 * A short id for this browser session, stable across reloads within the tab.
 *
 * The one thing that makes the logs usable. Without it a `[client-error]` line and the
 * `[profile]` line that caused it are two unrelated entries in a stream of many, and the only
 * way to connect them is a guess about timestamps. With it, `npx vercel logs | grep <sid>`
 * returns one person's entire run.
 *
 * Not a user identifier and not persistent: it dies with the tab, is never sent anywhere but
 * our own log endpoint, and carries nothing about who someone is.
 */
export function sessionId(): string {
  try {
    const existing = sessionStorage.getItem(SID_KEY);
    if (existing) return existing;
    const sid = Math.random().toString(36).slice(2, 10);
    sessionStorage.setItem(SID_KEY, sid);
    return sid;
  } catch {
    /* Storage unavailable. An unstable id still beats none — lines from one request still
       correlate with each other, they just will not survive a reload. */
    return "nostore";
  }
}

export function clearSnapshot(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* See saveSnapshot. */
  }
}

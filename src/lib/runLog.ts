/**
 * One record per completed run — the whole flow, as it actually happened.
 *
 * WHY THIS AND NOT THE EXISTING LOGGING. `/api/log` reports single events and caps every
 * field at 500 characters, which is right for an error line and useless for reconstructing a
 * session. The questions are generated per business, so two people never see the same flow;
 * without a record of what was actually on screen, "the third question was wrong" is not a
 * reproducible statement. `QuestionTrace` has recorded that since 02 Sep and **nothing has
 * ever read it** — it died with the tab. This is what reads it.
 *
 * WHAT IT IS FOR, concretely:
 *  - per-question drop-off. Darrel's competitor research puts quiz completion at 40-65%
 *    (docs/competitor-qualification.md), so raising MAX_QUESTIONS without measuring where
 *    people quit is guessing. This is the instrument that turns that into a number.
 *  - whether the flow actually adapts. `priority` and `prefilled` varying across runs is the
 *    evidence; identical on every run means we have quietly gone back to one fixed path.
 *  - what a person saw when they report a problem, including which words were generated.
 *
 * PRIVACY. `businessText` is prose somebody typed about their own business. That is fine for
 * our own testing and for a local `runs.jsonl`; it is a deliberate decision before anything
 * durable in production, not a default. Nothing here is an identifier: `sid` is a random
 * per-tab string that dies with the tab and is never joined to anything.
 */

import { collectedDegradations } from "./errorLog";
import { sessionId } from "./persist";
import type { EngineState } from "./engine";

export interface RunRecord {
  sid: string;
  at: string;
  /** "live" or "replay" — a replay run tells you nothing about model behaviour. */
  mode: string;
  businessText: string;
  profile: Record<string, unknown>;
  /** Questions the free text answered, so they were never asked. */
  prefilled: string[];
  /** Questions answered in prose. No fixed rule can read these — see engine.ts. */
  prosaic: string[];
  /** The model's ranking. Empty means the engine fell back to fixed weights. */
  priority: string[];
  /** Every question as displayed, and what was done with it. */
  trail: {
    id: string;
    origin: string;
    prompt: string;
    options: string[];
    picked: string[];
    freeText?: string;
    answeredAt: number;
  }[];
  plan: Record<string, unknown>;
  /** Setups still viable at the reveal, and the needs that forced the chosen one. */
  viableSetups: number;
  needs: { id: string; because: string; entitlement: string }[];
  /** Which feature lines were generated vs fixed, and the words used. */
  reasons: Record<string, string>;
  rationale: { rationale: string; whyNotCheaper: string };
  degradations: { what: string; detail?: string; at: number }[];
}

export function buildRunRecord(input: {
  engine: EngineState;
  businessText: string;
  mode: string;
  plan: Record<string, unknown>;
  /** Setups still viable at the reveal, and the needs that forced the chosen one. */
  viableSetups: number;
  needs: { id: string; because: string; entitlement: string }[];
  reasons: Record<string, string>;
  rationale: { rationale: string; whyNotCheaper: string };
}): RunRecord {
  const { engine } = input;
  return {
    sid: sessionId(),
    at: new Date().toISOString(),
    mode: input.mode,
    businessText: input.businessText.slice(0, 2000),
    profile: engine.profile as Record<string, unknown>,
    prefilled: engine.prefilled ?? [],
    prosaic: engine.prosaic ?? [],
    priority: engine.priority ?? [],
    trail: (engine.trail ?? []).map((t) => ({
      id: t.id,
      origin: t.origin,
      prompt: t.prompt,
      /* Labels as displayed, not ids — the whole point is what a person actually read. */
      options: t.options.map((o) => o.label),
      picked: t.options.filter((o) => t.pickedOptionIds.includes(o.id)).map((o) => o.label),
      ...(t.freeText ? { freeText: t.freeText } : {}),
      answeredAt: t.answeredAt,
    })),
    plan: input.plan,
    viableSetups: input.viableSetups,
    needs: input.needs,
    reasons: input.reasons,
    rationale: input.rationale,
    degradations: collectedDegradations(),
  };
}

/**
 * Post the record once, at the reveal.
 *
 * `keepalive` because the reveal is where people leave — a CTA click navigates away, and a
 * normal fetch is cancelled on unload. Best-effort throughout: this is an instrument, and an
 * instrument that can break the flow it measures is worse than no instrument.
 */
export async function postRun(record: RunRecord): Promise<void> {
  try {
    await fetch("/api/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(record),
      keepalive: true,
    });
  } catch {
    /* Never surfaced. Losing a log line must not cost the person their reveal. */
  }
}

/**
 * Hand the run to a person as a file.
 *
 * The best bug report anyone can give us: it carries the generated wording, every answer, the
 * plan and every degradation, so a problem can be read rather than reproduced. See
 * `debugEnabled` for when the control is shown.
 */
export function downloadRun(record: RunRecord): void {
  const blob = new Blob([JSON.stringify(record, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `findmyneo-run-${record.sid}-${record.at.slice(0, 19).replace(/[:T]/g, "")}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  /* Revoke on the next tick: revoking synchronously can cancel the download in some browsers. */
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Is the debug control shown?
 *
 * **On by default in local dev**, because when you are running the dev server you are working
 * on this, and a tool you have to remember a query string to reach is a tool you do not use.
 * That was the first version and it failed the only test that matters: nobody could find it.
 *
 * Anywhere else it stays opt-in via `?debug=1`, so a visitor to the deployed build never sees
 * it — and `?debug=0` turns it off locally for a clean screenshot or a demo.
 */
export function debugEnabled(): boolean {
  try {
    const param = new URLSearchParams(location.search).get("debug");
    if (param === "1") return true;
    if (param === "0") return false;
    const host = location.hostname;
    return host === "localhost" || host === "127.0.0.1";
  } catch {
    return false;
  }
}

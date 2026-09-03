/**
 * Client error reporting.
 *
 * The app is on a public link that people open unattended, so a crash would otherwise be a
 * blank page nobody hears about. This posts to /api/log, which writes one greppable line into
 * Vercel's runtime logs (`npx vercel logs <deployment-url>`).
 *
 * Three rules, all learned the boring way:
 *  - It must never throw. An error reporter that errors is worse than none.
 *  - It must be rate-limited. A render loop can fire hundreds of errors a second and would
 *    otherwise DoS our own logs.
 *  - It must be silent to the user. This is telemetry, not a feature.
 */

const ENDPOINT = "/api/log";

/** Inlined rather than imported: telemetry must not depend on, or crash with, persistence. */
function readSid(): string {
  try {
    return sessionStorage.getItem("findmyneo.sid") ?? "none";
  } catch {
    return "nostore";
  }
}

/** Same message twice is almost always the same bug. Report each distinct one once. */
const seen = new Set<string>();
const MAX_REPORTS = 8;
let sent = 0;

function report(payload: {
  message: string;
  source?: string;
  stack?: string;
}): void {
  try {
    if (sent >= MAX_REPORTS) return;
    const key = payload.message + "|" + (payload.source ?? "");
    if (seen.has(key)) return;
    seen.add(key);
    sent++;

    // keepalive so a report still goes out if the error killed the page.
    void fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      /* `sid` is what ties this line to the /api/profile line from the same run. Read it
         lazily and inline: importing persist.ts at module scope would pull sessionStorage
         access into the error path, which is the one place that must never throw. */
      body: JSON.stringify({ ...payload, sid: readSid(), url: location.href }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* never let telemetry break the app */
  }
}

/** Call once, as early as possible. */
export function installErrorLogging(): void {
  window.addEventListener("error", (e) => {
    /* Extension noise and cross-origin script errors arrive as a bare "Script error." with no
       stack. Filtering them keeps the log readable — see the Grammarly / chrome.runtime chatter
       that shows up in the console on Neo's page. */
    if (!e.message || e.message === "Script error.") return;
    report({
      message: e.message,
      source: e.filename ? `${e.filename}:${e.lineno}:${e.colno}` : undefined,
      stack: e.error?.stack,
    });
  });

  window.addEventListener("unhandledrejection", (e) => {
    const r = e.reason;
    report({
      message: r instanceof Error ? r.message : String(r),
      source: "unhandledrejection",
      stack: r instanceof Error ? r.stack : undefined,
    });
  });
}

/**
 * Report a DEGRADATION rather than a crash.
 *
 * This is the more important half. The app swallows failures on purpose — domain lookup
 * returns nothing, Neo's generator falls back to a recorded fixture — so a total outage at a
 * dependency looks identical to a quiet day from the outside. Without this we would happily
 * serve every visitor the bakery fixture and never find out.
 *
 * Not an error: nothing is broken for the user. It is a signal that something upstream is.
 */
/**
 * Every degradation this run, in order, so the run record can carry them.
 *
 * In memory only and never cleared: a run is one page life, and the record is posted at the
 * reveal. This is what turns "the reveal looked wrong" into "the domain lookup timed out and
 * the questions call fell back to the fixed bank", which is the difference between a bug
 * report you can act on and one you can only sympathise with.
 */
const degradations: { what: string; detail?: string; at: number }[] = [];

/** Read-only view for the run record. */
export function collectedDegradations(): { what: string; detail?: string; at: number }[] {
  return degradations.slice();
}

/**
 * Listeners for the dev-only degradation banner.
 *
 * `collectedDegradations()` is pull-only, which is right for the run record — it is read once
 * at the reveal. The banner needs a push, because the whole point is to notice a degradation
 * AT the moment it happens rather than after the flow is over.
 */
type DegradeListener = (all: { what: string; detail?: string; at: number }[]) => void;
const listeners = new Set<DegradeListener>();

/** Returns an unsubscribe. Dev banner only — nothing in the flow depends on this. */
export function onDegraded(fn: DegradeListener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function reportDegraded(what: string, detail?: string): void {
  degradations.push({ what, ...(detail ? { detail: detail.slice(0, 300) } : {}), at: Date.now() });
  for (const fn of listeners) {
    /* A throwing listener must never take down the call that degraded. */
    try {
      fn(degradations.slice());
    } catch {
      /* ignore */
    }
  }
  report({
    message: `degraded: ${what}`,
    source: "degradation",
    stack: detail,
  });
}

/** Used by the error boundary for React render failures, which don't hit window.onerror. */
export function reportReactError(error: Error, componentStack?: string): void {
  report({
    message: error.message,
    source: "react-render",
    stack: (error.stack ?? "") + (componentStack ? "\n--- components ---" + componentStack : ""),
  });
}

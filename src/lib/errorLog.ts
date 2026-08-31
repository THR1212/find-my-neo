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
      body: JSON.stringify({ ...payload, url: location.href }),
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
export function reportDegraded(what: string, detail?: string): void {
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

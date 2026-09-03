/**
 * POST /api/run — one record per completed run.
 *
 * Separate from `/api/log` because they are different size classes: that route reports single
 * events and clips every field to 500 characters, which is right for an error and useless for
 * a whole session. See src/lib/runLog.ts for what the record is for.
 *
 * Edge, like `/api/log`: it reads a body and writes a line. No SDK, no filesystem.
 *
 * IN DEV this route is not used — `vite.config.ts` mounts its own handler that appends to
 * `runs.jsonl`, because refining happens locally and a file you can grep beats a log stream
 * you have to page through.
 */

export const config = { runtime: "edge" };

/**
 * Vercel truncates very long log lines, and a full run with twelve generated questions can
 * run past it. So two lines: a compact summary that always survives, then the full record.
 * If the second is clipped the first still answers "did it adapt, and did anything degrade".
 */
export default async function handler(req: Request): Promise<Response> {
  if (req.method !== "POST") return new Response(null, { status: 405 });

  try {
    const r = (await req.json()) as Record<string, unknown>;
    const trail = Array.isArray(r.trail) ? r.trail : [];
    const plan = (r.plan ?? {}) as Record<string, unknown>;

    console.error(
      "[run]",
      JSON.stringify({
        sid: String(r.sid ?? "none").slice(0, 24),
        mode: String(r.mode ?? "?"),
        asked: trail.length,
        prefilled: Array.isArray(r.prefilled) ? r.prefilled.join(",") : "",
        priority: Array.isArray(r.priority) ? r.priority.join(",") : "",
        mail: plan.mailPlan ?? null,
        site: plan.sitePlan ?? null,
        mailboxes: plan.mailboxes ?? null,
        inr: plan.monthlyInr ?? null,
        degraded: Array.isArray(r.degradations) ? r.degradations.length : 0,
        at: r.at ?? new Date().toISOString(),
      }),
    );

    /* The full record, for when the summary is not enough. Clipped so one runaway payload
       cannot flood the log; the summary above is the part that must always survive. */
    console.error("[run-full]", JSON.stringify(r).slice(0, 12000));
  } catch {
    console.error("[run]", JSON.stringify({ error: "unparseable body" }));
  }

  /* 204 always. This is an instrument; it must never report a failure the app might act on. */
  return new Response(null, { status: 204 });
}

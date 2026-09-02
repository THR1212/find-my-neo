/**
 * POST /api/questions — free text in, reworded question surface out.
 *
 * Thin wrapper over `api/_lib/questionService.ts`, which the Vite dev server also mounts.
 *
 * Separate from /api/profile because of latency, not tidiness: together they took 37s in
 * production, and the guess screen only needs the profile. See questionService's header.
 *
 * NODE RUNTIME, and unlike our other routes that is not an accident.
 *
 * `api/domains`, `api/neo-site` and `api/log` are Edge because they are plain fetch-and-shape
 * handlers. This one is not: it reaches the OpenAI SDK and, in replay mode, the filesystem.
 * Both are unavailable on Edge, and putting them there broke every PRODUCTION deploy with:
 *
 *   The Edge Function "api/domains" is referencing unsupported modules:
 *     - api/_lib/replay.js: node:fs/promises, node:path
 *     - openai: #x509-transport-state
 *
 * Two things about that error are worth remembering. It names `api/domains`, which does not
 * import either module — Vercel bundles Edge functions into one shared namespace, so the
 * function it blames is not the function at fault. And it fires at "Deploying outputs", AFTER
 * the build succeeds, so `npm run build` and even a local `vercel build` both report success.
 * Only an actual deploy catches it.
 *
 * Node also happens to be the right home on the merits: no Edge CPU ceiling on a 17s model
 * call, and the OpenAI SDK is supported here rather than tolerated.
 *
 * Node runtime means Node-style (req, res) — NOT the Web `Request`/`Response` the Edge routes
 * use. Do not copy this handler's shape into them, or the `new URL(req.url)` bug returns.
 */

import { handleQuestions } from "./_lib/questionService.js";

/* "nodejs", not "nodejs20.x" — the version-suffixed form is rejected at deploy time:
   unsupported "runtime" value in `config` (must be one of: edge, experimental-edge, nodejs). */
export const config = { runtime: "nodejs" };

/** Minimal shapes, so this does not depend on @vercel/node just to name two arguments. */
interface NodeReq {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  on(event: string, cb: (chunk?: unknown) => void): void;
}
interface NodeRes {
  statusCode: number;
  setHeader(k: string, v: string): void;
  end(body?: string): void;
}

function readBody(req: NodeReq): Promise<string> {
  return new Promise((resolve) => {
    let raw = "";
    req.on("data", (c) => (raw += String(c)));
    req.on("end", () => resolve(raw));
  });
}

export default async function handler(req: NodeReq, res: NodeRes): Promise<void> {
  res.setHeader("Content-Type", "application/json");
  /**
   * No shared cache, and no pretending otherwise.
   *
   * This once carried `s-maxage=600` with a comment claiming it stopped a rehearsal loop
   * paying for repeat completions. That was wrong: this is a POST, and Vercel's CDN does not
   * cache POST responses, so the header did nothing at all — worse than nothing, because it
   * read like a cost control that existed.
   *
   * Real repeat-protection needs a cache keyed on a hash of the description (Upstash, or
   * Vercel's Runtime Cache). Until then every submit costs a completion, which at ~$0.0005
   * on luna is a deliberate non-problem. Rehearse with `VITE_LLM_MODE=replay` for free.
   */
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    res.statusCode = 405;
    res.end(JSON.stringify({ error: "method not allowed" }));
    return;
  }

  let businessText: unknown;
  try {
    businessText = (JSON.parse((await readBody(req)) || "{}") as { businessText?: unknown })
      .businessText;
  } catch {
    res.statusCode = 400;
    res.end(JSON.stringify({ error: "invalid JSON body" }));
    return;
  }

  /* Correlates the server log line with the client-error lines from the same run. */
  const header = req.headers["x-fmn-session"];
  const sid = String(Array.isArray(header) ? header[0] : (header ?? "none")).slice(0, 24);

  const { status, body } = await handleQuestions(businessText, sid);
  res.statusCode = status;
  res.end(JSON.stringify(body));
}

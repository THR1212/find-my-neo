/**
 * GET /api/neo-site?bn=<business name>&bd=<description>&ik=<industry key>
 *
 * Thin wrapper. Logic lives in _lib/neoSite.ts so the Vite dev middleware runs the same code.
 * Returns 200 with `{ site: null, error }` rather than an error status when the live call
 * fails — the client then falls back to the recorded fixture, and a failed upstream should
 * not look like a broken endpoint of ours.
 */

import { generateNeoSite } from "./_lib/neoSite.js";

/**
 * Edge runtime, deliberately.
 *
 * This handler is written against the Web API (`Request`/`Response`). Vercel's default
 * Node runtime instead passes an IncomingMessage whose `req.url` is a bare PATH, so
 * `new URL(req.url)` throws ERR_INVALID_URL — which is exactly how this failed in
 * production the first time. Edge gives the Web API signature the code assumes.
 *
 * Safe here: we only use fetch and process.env, both of which Edge supports.
 */
export const config = { runtime: "edge" };

export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const bn = (url.searchParams.get("bn") ?? "").slice(0, 55);
  const bd = (url.searchParams.get("bd") ?? "").slice(0, 2000);
  const ik = url.searchParams.get("ik") ?? "ecommerce_retail";

  if (!bd.trim()) {
    return Response.json({ site: null, error: "missing `bd`" }, { status: 400 });
  }

  try {
    const site = await generateNeoSite(bn, bd, ik);
    return Response.json(
      { site },
      {
        // Same business text yields the same site for a while — spares Neo's API on a
        // rehearsal loop without making the demo feel stale.
        headers: { "Cache-Control": "public, max-age=300, s-maxage=1800" },
      },
    );
  } catch (err) {
    return Response.json({
      site: null,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

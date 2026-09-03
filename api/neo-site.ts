/**
 * POST /api/neo-site  { bn, bd, ik? }
 * GET kept for curl/debug: /api/neo-site?bn=&bd=&ik=
 *
 * Thin wrapper. Logic lives in _lib/neoSite.ts so the Vite dev middleware runs the same code.
 * Returns 200 with `{ site: null, error }` rather than an error status when the live call
 * fails — the client then decides whether the bakery fixture is allowed.
 */

import { generateNeoSites } from "./_lib/neoSite.js";

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

const NO_STORE = { "Cache-Control": "private, no-store" };

async function paramsOf(req: Request): Promise<{ bn: string; bd: string; ik: string }> {
  if (req.method === "POST") {
    const body = (await req.json().catch(() => ({}))) as {
      bn?: unknown;
      bd?: unknown;
      ik?: unknown;
    };
    return {
      bn: String(body.bn ?? "").slice(0, 55),
      bd: String(body.bd ?? "").slice(0, 2000),
      ik: String(body.ik ?? "").slice(0, 80),
    };
  }
  const url = new URL(req.url);
  return {
    bn: (url.searchParams.get("bn") ?? "").slice(0, 55),
    bd: (url.searchParams.get("bd") ?? "").slice(0, 2000),
    ik: (url.searchParams.get("ik") ?? "").slice(0, 80),
  };
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== "GET" && req.method !== "POST") {
    return Response.json({ error: "method not allowed" }, { status: 405, headers: NO_STORE });
  }

  const { bn, bd, ik } = await paramsOf(req);

  if (!bd.trim()) {
    return Response.json({ site: null, error: "missing `bd`" }, { status: 400, headers: NO_STORE });
  }

  try {
    const sites = await generateNeoSites(bn, bd, ik, 2);
    return Response.json({ site: sites[0] ?? null, sites }, { headers: NO_STORE });
  } catch (err) {
    return Response.json(
      { site: null, error: err instanceof Error ? err.message : String(err) },
      { headers: NO_STORE },
    );
  }
}

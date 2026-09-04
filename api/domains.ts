/**
 * Vercel serverless function: GET /api/domains?name=<stem>&tlds=com,in,co
 *
 * Thin wrapper — all logic is in _lib/domainService.ts so the Vite dev middleware in
 * vite.config.ts runs exactly the same code path locally. The only thing that differs
 * between local and deployed is how the request object is shaped.
 */

import { handleDomainLookup } from "./_lib/domainService.js";

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
  const titan = url.searchParams.get("titan");
  const { status, body } = await handleDomainLookup(
    url.searchParams.get("name"),
    url.searchParams.get("tlds"),
    url.searchParams.get("manual"),
    titan,
  );

  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      /* The titan check is NOT shared-cacheable. Its answer is about Neo's live order
         records, and its `null` is a transient "we could not reach the panel" — pinning that
         into a shared edge cache for an hour would turn one bad minute into an hour of
         silence for every visitor. The batch lookup keeps the long cache: availability and
         prices move slowly, and letting the edge absorb repeat rehearsal runs is what stops
         a demo morning spending credits. */
      "Cache-Control": titan
        ? "private, no-store"
        : "public, max-age=300, s-maxage=3600",
    },
  });
}

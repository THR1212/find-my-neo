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
  const { status, body } = await handleDomainLookup(
    url.searchParams.get("name"),
    url.searchParams.get("tlds"),
  );

  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      // Availability and prices move slowly; let the edge absorb repeat demo runs
      // so a rehearsal doesn't spend credits.
      "Cache-Control": "public, max-age=300, s-maxage=3600",
    },
  });
}

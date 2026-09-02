/**
 * POST /api/profile — free text in, a structured profile out.
 *
 * Thin wrapper. All the logic is in `api/_lib/profileService.ts`, which the Vite dev server
 * also mounts, so `npm run dev` and the deployed build run the same code.
 *
 * Edge runtime, deliberately. This handler is written against the Web API (`Request`/
 * `Response`); Vercel's default Node runtime passes an IncomingMessage whose `req.url` is a
 * bare path and `new URL()` throws. That failure cannot be reproduced locally — the Vite dev
 * middleware hands over a different object — so it only ever shows up in production.
 */

import { handleProfile } from "./_lib/profileService.js";

export const config = { runtime: "edge" };

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  let businessText: unknown;
  try {
    businessText = ((await req.json()) as { businessText?: unknown }).businessText;
  } catch {
    return new Response(JSON.stringify({ error: "invalid JSON body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { status, body } = await handleProfile(businessText);

  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      /* Same description in, same profile out. A short shared cache means a rehearsal loop,
         or two judges typing the demo business, do not each pay for a completion. */
      "Cache-Control": "public, max-age=60, s-maxage=600",
    },
  });
}

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

  /* Correlates the server log line with the client-error lines from the same run. */
  const sid = (req.headers.get("x-fmn-session") ?? "none").slice(0, 24);
  const { status, body } = await handleProfile(businessText, sid);

  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      /**
       * No shared cache, and no pretending otherwise.
       *
       * This carried `s-maxage=600` with a comment claiming it stopped a rehearsal loop
       * paying for repeat completions. That was wrong: this is a POST, and Vercel's CDN does
       * not cache POST responses, so the header did nothing at all. Worse than nothing —
       * it read like a cost control that existed.
       *
       * Repeat-submit protection, if it is ever wanted, has to be a real cache keyed on a
       * hash of the description (Upstash Redis, or Vercel's Runtime Cache). Until then the
       * honest answer is that every submit costs a completion, which at ~$0.0005 on luna is
       * a deliberate non-problem. Use `VITE_LLM_MODE=replay` to rehearse for free.
       */
      "Cache-Control": "no-store",
    },
  });
}

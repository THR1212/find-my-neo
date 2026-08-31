/**
 * POST /api/log — client error sink.
 *
 * The app is now on a public URL that people click unattended. Without this, a render crash
 * shows them a blank page and we never hear about it. Errors land in Vercel's runtime logs:
 *
 *   npx vercel logs <deployment-url>
 *
 * Deliberately minimal. No third-party service, no SDK, no bundle cost on the client beyond a
 * few lines. If this ever needs to be more than "tell me it broke", use Sentry — which is what
 * Neo themselves run.
 *
 * Always returns 204. A logging endpoint that can fail visibly is worse than no logging.
 */

export const config = { runtime: "edge" };

/** Cap what we accept so a runaway loop can't write novels into the log. */
const MAX_FIELD = 500;
const clip = (v: unknown) => (typeof v === "string" ? v.slice(0, MAX_FIELD) : undefined);

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== "POST") return new Response(null, { status: 405 });

  try {
    const b = (await req.json()) as Record<string, unknown>;
    // One line, greppable. `console.error` is what surfaces in Vercel's runtime logs.
    console.error(
      "[client-error]",
      JSON.stringify({
        msg: clip(b.message),
        src: clip(b.source),
        stack: clip(b.stack),
        url: clip(b.url),
        ua: clip(req.headers.get("user-agent") ?? undefined),
        at: new Date().toISOString(),
      }),
    );
  } catch {
    // Malformed body is itself worth knowing about, but must not 500.
    console.error("[client-error] unparseable payload");
  }

  return new Response(null, { status: 204 });
}

/**
 * Preview deploys often do not get Production env vars. Without LLM_API_KEY the
 * branch URL cannot call the model, so a cinema description comes back empty while
 * the Production (master) URL answers. The preview function can still POST to
 * Production server-side — no browser CORS, no key copied into Preview.
 *
 * No-ops when this deploy already has a key, or when we would call ourselves.
 */

export async function proxyToProduction(
  path: "/api/profile" | "/api/questions",
  businessText: string,
  sid: string,
): Promise<{ status: number; body: Record<string, unknown> } | null> {
  if (process.env.LLM_API_KEY) return null;
  if (!process.env.VERCEL) return null;

  const raw =
    process.env.FMN_UPSTREAM_API ||
    process.env.VERCEL_PROJECT_PRODUCTION_URL ||
    "find-my-neo-hari-7720.vercel.app";

  const upstream = raw.startsWith("http") ? raw.replace(/\/$/, "") : `https://${raw.replace(/\/$/, "")}`;
  const self = (process.env.VERCEL_URL ?? "").replace(/^https?:\/\//, "");
  if (self && upstream.includes(self)) return null;

  try {
    const res = await fetch(`${upstream}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-fmn-session": sid,
      },
      body: JSON.stringify({ businessText }),
    });
    const body = (await res.json()) as Record<string, unknown>;
    if (path === "/api/profile" && body && typeof body === "object") {
      const profile = body.profile as { summary?: string } | undefined;
      if (!body.meterGuess && profile?.summary) {
        body.meterGuess = String(profile.summary)
          .replace(/^\s*a\s+/i, "")
          .replace(/\d[\d,]*/g, "")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 52);
      }
    }
    return { status: res.status, body };
  } catch (err) {
    console.error(
      "[upstream]",
      JSON.stringify({
        path,
        upstream,
        reason: err instanceof Error ? err.message : String(err),
      }),
    );
    return null;
  }
}

/**
 * Client-side seam. One function the screens call; they never learn where the data came from.
 *
 * IMPORTANT — why replay is resolved client-side rather than through api/*:
 * tomorrow's PM demo runs on plain `npm run dev`, where no serverless function exists.
 * Routing replay through api/_lib/llm.ts would require `vercel dev`, which is one more
 * moving part on demo morning for zero benefit. So:
 *
 *   VITE_LLM_MODE=replay (default) -> import the committed fixture here, no network at all
 *   VITE_LLM_MODE=live             -> POST /api/profile, which uses the server seam
 *
 * The server path (api/_lib/llm.ts) stays intact for Ignite, where the deployed build needs
 * a real key that must never reach the browser. Both paths return the same shape.
 */

import type { Profile, RevealContent } from "./session";
import demoFixture from "../data/replay/demo.json";

const MODE = import.meta.env.VITE_LLM_MODE ?? "replay";

/** Replay pauses so the reveal still feels earned rather than pre-baked. */
const REPLAY_DELAY_MS = Number(import.meta.env.VITE_REPLAY_DELAY_MS ?? 1400);

export interface ProfileResult {
  profile: Profile;
  reveal: RevealContent;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Fired on screen-1 submit. Resolves while the user taps through screens 2-4, so the
 * reveal is already in memory by the time they arrive. Do not move this call to screen 5.
 */
export async function buildProfile(businessText: string): Promise<ProfileResult> {
  if (MODE === "replay") {
    await sleep(REPLAY_DELAY_MS);
    const { profile, reveal } = demoFixture as unknown as ProfileResult;
    return { profile, reveal };
  }

  const res = await fetch("/api/profile", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ businessText }),
  });

  if (!res.ok) {
    throw new Error(`profile request failed: ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as ProfileResult;
}

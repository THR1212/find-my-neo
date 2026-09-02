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

import { reportDegraded } from "./errorLog";
import { sessionId } from "./persist";
import type { SurfaceMap } from "./questions";
import type { Profile, RevealContent } from "./session";
import demoFixture from "../data/replay/demo.json";

const MODE = import.meta.env.VITE_LLM_MODE ?? "replay";

/** Replay pauses so the reveal still feels earned rather than pre-baked. */
const REPLAY_DELAY_MS = Number(import.meta.env.VITE_REPLAY_DELAY_MS ?? 1400);

export interface ProfileResult {
  profile: Profile;
  reveal: RevealContent;
  /**
   * Which question the model thinks is most worth asking first, given what the free text
   * already revealed. Advisory only — engine.ts overrules it if that signal is already
   * resolved or the id isn't real, so a bad suggestion can't break the flow.
   */
  nextQuestionId?: string | null;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Shout if a deployed build is serving fixtures.
 *
 * This cost a production outage that looked like success. `VITE_LLM_MODE` is a BUILD-TIME
 * client variable; the three server vars (LLM_MODE, LLM_MODEL, LLM_API_KEY) were set on
 * Vercel and `/api/profile` answered correctly to curl — but the browser bundle had defaulted
 * to "replay", so the app never called the route at all and every visitor saw the recorded
 * bakery. Testing the route directly passed while the thing that was broken sat one layer up.
 *
 * On localhost replay is a legitimate choice (it is how you rehearse for free). Anywhere else
 * it means someone forgot a build variable, and nothing else will ever say so.
 */
let warnedReplay = false;
function warnIfReplayInProduction(): void {
  if (warnedReplay || MODE !== "replay") return;
  const host = typeof location === "undefined" ? "" : location.hostname;
  if (host === "localhost" || host === "127.0.0.1" || host === "") return;
  warnedReplay = true;
  reportDegraded(
    "replay-in-production",
    `VITE_LLM_MODE is not "live" on ${host} — every visitor is seeing the recorded fixture`,
  );
}

/**
 * Fired on screen-1 submit. Resolves while the user taps through screens 2-4, so the
 * reveal is already in memory by the time they arrive. Do not move this call to screen 5.
 */
export async function buildProfile(businessText: string): Promise<ProfileResult> {
  if (MODE === "replay") {
    warnIfReplayInProduction();
    await sleep(REPLAY_DELAY_MS);
    const { profile, reveal, nextQuestionId } = demoFixture as unknown as ProfileResult;
    return { profile, reveal, nextQuestionId };
  }

  try {
    const res = await fetch("/api/profile", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        /* Correlates this request with the client-error lines from the same run. */
        "x-fmn-session": sessionId(),
      },
      body: JSON.stringify({ businessText }),
    });
    if (!res.ok) {
      throw new Error(`${res.status} ${(await res.text()).slice(0, 200)}`);
    }
    return (await res.json()) as ProfileResult;
  } catch (err) {
    /**
     * Degrade, don't throw (CLAUDE.md rule 4).
     *
     * This used to reject, and rejecting put "We couldn't read that. / Failed to fetch" on
     * screen — a dead end with a Try again button, from a dev server that had simply stopped.
     * Every other external call in this project already degrades: `fetchNeoSite` falls back to
     * a recorded response, `domainService` renders no badge rather than a wrong one. The
     * profile call was the last one that could take the whole flow down.
     *
     * Note what it deliberately does NOT fall back to: the replay fixture. That would show
     * "a two-person bakery in Bandra" to someone who typed a cinema in Texas, which is the
     * single most visible way this can embarrass itself in front of an audience. An empty
     * summary is honest — the guess screen has a state for exactly this, and the questions
     * still work without it; the engine just asks more of them.
     */
    reportDegraded("profile", err instanceof Error ? err.message : String(err));
    return derivedFallback(businessText);
  }
}

/**
 * Mirrors `derivedProfile` in api/_lib/profileService.ts, for when the route is unreachable
 * and that server-side fallback never gets to run. Deliberately claims nothing: no summary,
 * no industry, no headcount. Domain prices stay null — DomScan fills them on the reveal.
 */
function derivedFallback(businessText: string): ProfileResult {
  const stem =
    businessText
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 3)
      .slice(0, 2)
      .join("")
      .slice(0, 24) || "yourbusiness";

  return {
    profile: {
      summary: "",
      industry: "",
      teamSize: null,
      location: null,
      domainStem: stem,
      suggestedMailboxes: ["hello", "contact"],
    },
    nextQuestionId: null,
    reveal: {
      domains: [
        { name: `${stem}.com`, available: null, priceInr: null, recommended: true },
        { name: `${stem}.in`, available: null, priceInr: null },
        { name: `${stem}.co`, available: null, priceInr: null },
      ],
      mailboxes: [
        { address: `hello@${stem}.com`, label: "For enquiries and new customers" },
        { address: `contact@${stem}.com`, label: "For everything else" },
      ],
      site: { headline: "", subhead: "", sections: [] },
    },
  };
}

/**
 * Reworded question wording for this business. Fired alongside buildProfile, never awaited
 * before the guess screen shows.
 *
 * Why it is a separate call: together with the profile it measured **37s in production** —
 * slower than Neo's own generator, so the guess screen sat on "Working it out..." instead of
 * being hidden behind it. The guess needs only the profile; wording is not needed until
 * someone taps "That's us". The questions are roughly 5x the output tokens, so bundling them
 * made the fast half wait on the slow half for nothing.
 *
 * Never rejects. An empty surface is a complete answer — every question falls back to the
 * fixed bank in questions.ts, which is exactly what shipped before this existed.
 */
export async function fetchQuestionSurface(businessText: string): Promise<SurfaceMap> {
  if (MODE === "replay") return {};
  try {
    const res = await fetch("/api/questions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-fmn-session": sessionId() },
      body: JSON.stringify({ businessText }),
    });
    if (!res.ok) throw new Error(`${res.status}`);
    const body = (await res.json()) as { surface?: SurfaceMap };
    return body.surface ?? {};
  } catch (err) {
    reportDegraded("questions", err instanceof Error ? err.message : String(err));
    return {};
  }
}

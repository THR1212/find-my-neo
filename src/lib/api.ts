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
   * All six question ids, ranked most-worth-asking-first for THIS business.
   *
   * Replaced `nextQuestionId`, which was a single pick that App consumed once and discarded —
   * leaving questions 2, 3 and 4 to the engine's fixed weight order, which is identical for
   * every business. Advisory still: engine.ts re-checks every id against what is actually
   * unresolved, so a hallucinated or already-answered id is skipped rather than trusted.
   */
  questionPriority?: string[];
  /**
   * Signals the free text already answered, in the same value vocabulary a tapped option
   * would have produced. Merged straight into the profile.
   */
  prefill?: Record<string, string | string[] | boolean>;
  /** The question ids `prefill` closes — recorded so the guess screen can show them. */
  prefilledQuestionIds?: string[];
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
    return demoFixture as unknown as ProfileResult;
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
    /* Empty, not guessed: the call never happened, so we know nothing about this business.
       The engine's weight order is the honest default, and skipping a question on a fact we
       never read would be inventing an answer. */
    questionPriority: [],
    prefill: {},
    prefilledQuestionIds: [],
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

export interface PlanVerdict {
  mailTier: string;
  siteTier: string;
  /** True when a cited entitlement moved a tier above the deterministic answer. */
  raised: boolean;
  cites: { entitlement: string; evidence: string }[];
  /** Citations that failed verification. Logged, never shown. */
  rejected?: string[];
}

/**
 * Ask the model whether anything they SAID reveals a requirement the fixed questions missed.
 *
 * The only call that can change what someone pays, and it can only ever raise a tier — with a
 * cited entitlement and a quote the server finds in their own words. Everything else about the
 * plan is deterministic. See api/_lib/planService.ts.
 *
 * Never rejects: on any failure the caller keeps the deterministic recommendation, which is
 * already correct — this call exists to catch what the options could not express, not to
 * decide the ordinary case.
 */
export async function fetchPlanVerdict(input: {
  businessText: string;
  answers: { question: string; answer: string }[];
  mailTier: string;
  siteTier: string;
  /** Question ids answered by tapping. The model may not contradict these. */
  answeredByTap: string[];
}): Promise<PlanVerdict | null> {
  if (MODE === "replay") return null;
  try {
    const res = await fetch("/api/plan", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-fmn-session": sessionId() },
      body: JSON.stringify(input),
    });
    if (!res.ok) throw new Error(`${res.status}`);
    return (await res.json()) as PlanVerdict;
  } catch (err) {
    reportDegraded("plan", err instanceof Error ? err.message : String(err));
    return null;
  }
}

export interface RationaleResult {
  /** Replaces buildRationale's line. Empty means keep the fixed one. */
  rationale: string;
  /** "Why not the cheaper plan". Empty means show nothing — there is no fixed fallback. */
  whyNotCheaper: string;
}

/**
 * The two sentences under the price, written with the WHOLE run in hand.
 *
 * The only call fired after screen 1, because it is the only one that needs the answers. It
 * explains the plan `rules.ts` already chose — the plan and mailbox count go in as facts, never
 * as a question (CLAUDE.md rule 2).
 *
 * Never rejects, and never blocks: the reveal renders `buildRationale`'s fixed line until and
 * unless this lands. This is the one model call with no recorded fallback of its own, so the
 * fixed templates stay.
 */
export async function fetchRationale(input: {
  businessText: string;
  answers: { question: string; answer: string }[];
  mailPlanId: string;
  mailPlanName: string;
  sitePlanId: string | null;
  sitePlanName: string | null;
  mailboxes: number;
}): Promise<RationaleResult> {
  const empty = { rationale: "", whyNotCheaper: "" };
  if (MODE === "replay") return empty;
  try {
    const res = await fetch("/api/rationale", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-fmn-session": sessionId() },
      body: JSON.stringify(input),
    });
    if (!res.ok) throw new Error(`${res.status}`);
    return (await res.json()) as RationaleResult;
  } catch (err) {
    reportDegraded("rationale", err instanceof Error ? err.message : String(err));
    return empty;
  }
}

/**
 * Per-feature "why this matters to you" clauses for this business.
 *
 * Fired alongside the other two and never awaited. Its own route because it is needed at the
 * REVEAL, not before the first question — see api/_lib/reasonService.ts. Never rejects: an
 * empty map means every feature line renders its hand-written string, which is what shipped
 * before this existed.
 */
export async function fetchReasons(businessText: string): Promise<Record<string, string>> {
  if (MODE === "replay") return {};
  try {
    const res = await fetch("/api/reasons", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-fmn-session": sessionId() },
      body: JSON.stringify({ businessText }),
    });
    if (!res.ok) throw new Error(`${res.status}`);
    const body = (await res.json()) as { reasons?: Record<string, string> };
    return body.reasons ?? {};
  } catch (err) {
    reportDegraded("reasons", err instanceof Error ? err.message : String(err));
    return {};
  }
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

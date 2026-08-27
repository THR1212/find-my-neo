/**
 * One session object for the whole flow. Deliberately NOT per-screen state.
 *
 * Why: the reveal content is generated on screen-1 submit and resolves while the user is
 * tapping through screens 2-4. That is the entire latency strategy — by the time they reach
 * the reveal, it is already sitting in memory. Per-screen state makes that impossible without
 * a rewrite, so it is wired this way from the start even though replay mode returns instantly.
 */

/** Screen 1 free text is the only true input. Everything else refines it. */
export interface Profile {
  /** Short human label the guess screen reflects back, e.g. "a two-person bakery". */
  summary: string;
  /** LLM-normalised industry. The raw field in Neo's real data has 5,318 distinct values. */
  industry: string;
  teamSize: number;
  location: string | null;
  /** Suggested domain stem, slugified, no TLD. */
  domainStem: string;
  /** Names to build mailbox addresses from, e.g. ["hello", "orders"]. */
  suggestedMailboxes: string[];
  wantsSite: boolean;
}

/**
 * Option values below are Neo's live persona-survey sets, recovered from response data
 * (handoff §4). They are not an official question bank — re-check before shipping.
 * Reused rather than invented so the quiz stays continuous with existing data.
 */
export const IMPORT_OPTIONS = [
  { id: "none", label: "No, I'll start fresh" },
  { id: "emails", label: "Yes, import my emails" },
  { id: "both", label: "Yes, emails and contacts" },
  { id: "contacts", label: "Yes, import my contacts" },
] as const;

export type ImportChoice = (typeof IMPORT_OPTIONS)[number]["id"];

export const SURFACE_OPTIONS = [
  { id: "mail", label: "Just email", hint: "Professional address on my own domain" },
  { id: "both", label: "Email and a site", hint: "A one-page site I can launch today" },
] as const;

export type SurfaceChoice = (typeof SURFACE_OPTIONS)[number]["id"];

export interface Mailbox {
  address: string;
  label: string;
}

export interface RevealContent {
  domain: {
    name: string;
    available: boolean;
  };
  mailboxes: Mailbox[];
  site: {
    headline: string;
    subhead: string;
    sections: string[];
  };
}

export type ScreenId =
  | "hook"
  | "describe"
  | "guess"
  | "import"
  | "surface"
  | "reveal";

/** Order is fixed. Do not add screens — see CLAUDE.md. */
export const SCREEN_ORDER: ScreenId[] = [
  "hook",
  "describe",
  "guess",
  "import",
  "surface",
  "reveal",
];

export interface SessionState {
  screen: ScreenId;
  rawBusinessText: string;
  profile: Profile | null;
  reveal: RevealContent | null;
  importChoice: ImportChoice | null;
  surfaceChoice: SurfaceChoice | null;
  /** True from screen-1 submit until the reveal payload lands. */
  loading: boolean;
  error: string | null;
}

export const initialSession: SessionState = {
  screen: "hook",
  rawBusinessText: "",
  profile: null,
  reveal: null,
  importChoice: null,
  surfaceChoice: null,
  loading: false,
  error: null,
};

export function nextScreen(current: ScreenId): ScreenId {
  const i = SCREEN_ORDER.indexOf(current);
  return SCREEN_ORDER[Math.min(i + 1, SCREEN_ORDER.length - 1)];
}

export function prevScreen(current: ScreenId): ScreenId {
  const i = SCREEN_ORDER.indexOf(current);
  return SCREEN_ORDER[Math.max(i - 1, 0)];
}

/**
 * Free text in, a structured profile out. The ONLY place a model touches the flow.
 *
 * It does not pick a plan, a price, a billing cycle, or how many mailboxes someone should
 * buy. `src/lib/rules.ts` computes all of that from the profile deterministically, which is
 * what makes every number on the reveal defensible (CLAUDE.md rule 2).
 *
 * The logic lives here rather than in `api/profile.ts` for the same reason
 * `domainService.ts` exists: the Vite dev server mounts the same function so `npm run dev`
 * behaves like the deployed build, without needing `vercel dev` running on demo morning.
 *
 * Degradation, per CLAUDE.md rule 4: if the model call fails for any reason this returns a
 * derived profile rather than an error. A weak guess the user can correct with one tap on
 * "Not quite" beats a dead screen mid-demo. The payload carries `degraded: true`.
 */

import { complete, llmMode } from "./llm.js";

/**
 * Titan's analytics industry taxonomy — 16 industries over 103 sub-industries.
 *
 * Be precise about whose taxonomy this is, because three of them are in play:
 *   1. Neo's `business_industry` survey field — free text, 5,318 distinct values, 78% of them
 *      appearing exactly once and 1,128 the same answer typed differently. Routes nothing.
 *      This is the problem being solved.
 *   2. THIS one — Titan's, from the V2 persona dashboard. Not Neo-specific: the unfiltered
 *      pages cover 1.3M domains, i.e. all of Titan. But the same dashboard applies it to a
 *      `Neo Business` filter (29.9K domains), so it demonstrably classifies Neo's customers
 *      too — Neo's domains are a subset of Titan's.
 *   3. Neo's site-builder `industryKey` picker — what their generator actually consumes.
 *      We have only ever observed 7 of these, recovered from real requests.
 *
 * We normalise into (2) because it is the one with retention and conversion data behind it,
 * then map to (3) in `src/lib/handoff.ts` for the handoff. If someone gets Neo's full
 * industryKey list, emitting (3) directly would remove the mapping step — worth asking for.
 *
 * Do NOT say "1.3M Neo domains" anywhere near a judge. That figure is Titan-wide and the
 * Neo-filtered number is 29.9K; conflating them is wrong by two orders of magnitude.
 * See docs/data-findings.md §6 and its caveats.
 *
 * A strict enum so the model cannot invent a 5,319th value. "Bakery" resolves to Food &
 * Beverage instead of matching nothing, which is the entire point.
 */
export const INDUSTRIES = [
  "Professional & Business Services",
  "E-commerce & Retail",
  "Healthcare & Wellness",
  "Nonprofits/Social Impact & Public Services",
  "Technology & IT Services",
  "Financial Services",
  "Logistics & Automotive",
  "Media & Entertainment",
  "Arts & Creative Services",
  "Education & Training",
  "Food & Beverage",
  "Marketing & Advertising",
  "Travel & Hospitality",
  "Recreation & Sports",
  "Manufacturing & Industrial",
  "Construction",
] as const;

/** Real question ids from src/lib/questions.ts. The engine overrules a bad pick anyway. */
const QUESTION_IDS = ["import", "surface", "channel", "client", "team", "sells"] as const;

/** Matches src/lib/domains.ts TLDS. The stem is the model's; the TLDs are not its business. */
const TLDS = ["com", "in", "co"] as const;

interface ModelProfile {
  summary: string;
  industry: (typeof INDUSTRIES)[number];
  /** Headcount, and ONLY headcount — never a mailbox count. See the system prompt. */
  teamSize: number | null;
  location: string | null;
  domainStem: string;
  suggestedMailboxes: string[];
  nextQuestionId: (typeof QUESTION_IDS)[number] | null;
  /** One short line per TLD saying why it is worth considering. Copy, never price. */
  domainNotes: string[];
  /** One short line per mailbox saying what it is for. */
  mailboxLabels: string[];
  /** Counter subtitle after the guess, before any question. No digits. */
  meterGuess: string;
}

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "summary",
    "industry",
    "teamSize",
    "location",
    "domainStem",
    "suggestedMailboxes",
    "mailboxLabels",
    "nextQuestionId",
    "domainNotes",
    "meterGuess",
  ],
  properties: {
    summary: {
      type: "string",
      description:
        "One noun phrase completing \"You're ...\", e.g. 'a two-person bakery in Bandra " +
        "taking custom cake orders over Instagram'. No trailing full stop. The phrase does " +
        "not begin with a capital, but KEEP the normal capitalisation of proper nouns — " +
        "place names, the business name, Instagram, WhatsApp. Never lowercase those.",
    },
    industry: { type: "string", enum: INDUSTRIES as unknown as string[] },
    teamSize: {
      type: ["integer", "null"],
      description: "Number of PEOPLE, only if the text says or clearly implies it. Else null.",
    },
    location: { type: ["string", "null"], description: "As written, e.g. 'Bandra, Mumbai'." },
    domainStem: {
      type: "string",
      description:
        "Lowercase a-z and 0-9 only. No spaces, hyphens, dots or TLD. From the business " +
        "name if there is one, otherwise from what they do.",
    },
    suggestedMailboxes: {
      type: "array",
      minItems: 2,
      maxItems: 3,
      items: { type: "string" },
      description: "Local parts only, no @ and no domain. e.g. ['hello','orders'].",
    },
    mailboxLabels: {
      type: "array",
      minItems: 2,
      maxItems: 3,
      items: { type: "string" },
      description:
        "What each address is for, same order as suggestedMailboxes. Lowercase, no full " +
        "stop, e.g. 'so cake orders stop living in your DMs'.",
    },
    nextQuestionId: { type: ["string", "null"], enum: [...QUESTION_IDS, null] },
    domainNotes: {
      type: "array",
      minItems: 3,
      maxItems: 3,
      items: { type: "string" },
      description:
        "One short reason per domain, in order .com then .in then .co. Never mention price.",
    },
    meterGuess: {
      type: "string",
      description:
        "Subtitle for the narrowing counter on the guess screen. Names this kind of " +
        "business. No digits. Under 52 characters. e.g. 'bakeries taking orders over Instagram'.",
    },
  },
} as const;

const SYSTEM = [
  "You read a one-or-two sentence description of a small business and return a structured",
  "profile. Question wording is generated separately and is not your job.",
  "",
  "You must never choose a plan, a price, a billing cycle, or how many mailboxes someone",
  "should buy. Deterministic code computes those from your profile. Emitting one would put",
  "an invented number in front of a paying customer.",
  "",
  "teamSize is HEADCOUNT and nothing else. Never infer it from how many mailboxes the",
  "business might want: in this product's data 39-64% of the mailboxes on a domain are role",
  "addresses like info@ or sales@, so a one-person business routinely wants three. A separate",
  "question asks for the address count. If the text does not say how many people, return null.",
  "",
  "suggestedMailboxes should fit the business: a bakery taking orders wants hello@ and",
  "orders@; a consultancy wants hello@ and accounts@. Prefer role addresses over personal",
  "names, because a role address survives the person leaving.",
  "",
  "nextQuestionId is which question is most worth asking FIRST given what the text already",
  "told you. Prefer one whose answer the text does not already contain. Return null if you",
  "have no preference. The options are:",
  "  import  - are they bringing existing mail or contacts across",
  "  surface - do they need email only, or email and a website",
  "  channel - where customers reach them today",
  "  client  - which mail app they use now",
  "  team    - how many email addresses they need",
  "  sells   - do people pay them online",
  "",
  "Write summary in the customer's own register. Plain, specific, no marketing language.",
  "",
  "meterGuess is the line under the narrowing counter on the guess screen. Names this kind",
  "of business. Never a number, never a price. e.g. 'bakeries taking cake orders over Instagram'.",
].join("\n");

const STOPWORDS = new Set([
  "the", "and", "for", "our", "was", "are", "with", "from", "that", "this", "have",
  "has", "were", "they", "you", "your", "run", "runs", "own", "small", "business",
  "company", "into", "over", "all", "who", "how", "get", "gets", "there",
]);

/**
 * What to show when the model call fails.
 *
 * Deliberately dumb and deterministic: slugify the first meaningful words, offer two generic
 * role addresses, and claim nothing about the industry. An unresolved industry leaves the
 * ring lower and makes the engine ask more, which is the correct behaviour when we genuinely
 * do not know — better than a confident wrong guess.
 */
function derivedProfile(businessText: string): ModelProfile {
  const words = businessText
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));

  return {
    summary: "",
    industry: "" as ModelProfile["industry"],
    teamSize: null,
    location: null,
    domainStem: words.slice(0, 2).join("") || "yourbusiness",
    suggestedMailboxes: ["hello", "contact"],
    mailboxLabels: ["For enquiries and new customers", "For everything else"],
    nextQuestionId: null,
    domainNotes: ["The one people will guess", "Reads as local", "Short, room to grow"],
    meterGuess: "",
  };
}

/** Slug guard. The stem lands in a domain name and in Neo's handoff URL. */
function cleanStem(raw: unknown): string {
  const s = String(raw ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  return s.slice(0, 24) || "yourbusiness";
}

export interface ProfileServiceResult {
  status: number;
  body: Record<string, unknown>;
}

export async function handleProfile(
  businessTextRaw: unknown,
  sid = "none",
): Promise<ProfileServiceResult> {
  const startedAt = Date.now();
  const businessText = String(businessTextRaw ?? "").slice(0, 2000);
  if (businessText.trim().length < 8) {
    return { status: 400, body: { error: "businessText too short" } };
  }

  let profile: ModelProfile;
  let degraded = false;
  let reason = "";

  try {
    profile = await complete<ModelProfile>({
      key: "profile",
      system: SYSTEM,
      user: businessText,
      schema: SCHEMA as unknown as Record<string, unknown>,
      schemaName: "business_profile",
      /* The output is small and fixed-shape. A tight ceiling makes truncation cheap to
         detect (llm.ts checks finish_reason) rather than surfacing as a JSON parse error. */
      maxOutputTokens: 3000,
    });
  } catch (err) {
    reason = err instanceof Error ? err.message : String(err);
    profile = derivedProfile(businessText);
    degraded = true;
  }

  /**
   * ONE line per request, on every path — not just failures.
   *
   * Logging only errors tells you what broke and nothing about how often. Without a success
   * line there is no denominator, so "are we degrading?" is unanswerable: three
   * [profile-degraded] lines could be 3 of 4 requests or 3 of 400. `console.error` because
   * that is what reliably surfaces in Vercel runtime logs.
   *
   * `sid` matches the client-error lines from the same run, so one grep returns a whole
   * session. `ms` is ours end-to-end and is the number that says whether the model is slow
   * or the function is.
   */
  console.error(
    "[profile]",
    JSON.stringify({
      sid,
      ms: Date.now() - startedAt,
      model: process.env.LLM_MODEL ?? "default",
      mode: llmMode(),
      chars: businessText.length,
      degraded,
      ...(reason ? { reason: reason.slice(0, 200) } : {}),
    }),
  );

  const stem = cleanStem(profile.domainStem);
  const locals = (profile.suggestedMailboxes ?? [])
    .map((m) => String(m).toLowerCase().replace(/[^a-z0-9]/g, ""))
    .filter(Boolean)
    .slice(0, 3);
  const mailboxLocals = locals.length ? locals : ["hello", "contact"];
  const primary = `${stem}.${TLDS[0]}`;

  return {
    status: 200,
    body: {
      profile: {
        summary: profile.summary ?? "",
        industry: INDUSTRIES.includes(profile.industry as never) ? profile.industry : "",
        teamSize: typeof profile.teamSize === "number" ? profile.teamSize : null,
        location: profile.location ?? null,
        domainStem: stem,
        suggestedMailboxes: mailboxLocals,
      },
      nextQuestionId: QUESTION_IDS.includes(profile.nextQuestionId as never)
        ? profile.nextQuestionId
        : null,
      reveal: {
        /* priceInr AND available are both null, and that is the point: the model produces
           neither. `/api/domains` fills them from DomScan when the reveal mounts, and until
           it does Reveal.tsx renders no price and no badge rather than a wrong one.
           `available` was `true` here once, "optimistic for the first paint" — which meant a
           failed lookup showed a green Available on a domain that was actually taken. An
           unverified claim about something a person can check in one keystroke is the worst
           kind to get wrong. */
        domains: TLDS.map((tld, i) => ({
          name: `${stem}.${tld}`,
          available: null,
          priceInr: null,
          note: profile.domainNotes?.[i] ?? undefined,
          recommended: i === 0,
        })),
        mailboxes: mailboxLocals.map((local, i) => ({
          address: `${local}@${primary}`,
          label: profile.mailboxLabels?.[i] ?? "",
        })),
        /* Reveal.tsx does not read this — it renders Neo's real generated site instead, and
           CLAUDE.md is explicit that we do not write site copy. Kept only because
           RevealContent requires the field. */
        site: { headline: "", subhead: "", sections: [] },
      },
      /* Guess-screen meter subtitle. Digits stripped so a model cannot write a count. */
      meterGuess: String(profile.meterGuess ?? "")
        .replace(/\d[\d,]*/g, "")
        .replace(/\s+/g, " ")
        .trim(),
      degraded,
      mode: llmMode(),
      ...(reason ? { reason: reason.slice(0, 240) } : {}),
    },
  };
}

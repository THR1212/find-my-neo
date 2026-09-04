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

import { deriveGuessSummary } from "../../src/lib/derivedGuess.js";
import { complete } from "./llm.js";

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
const QUESTION_IDS = [
  "import",
  "surface",
  "channel",
  "team",
  "sells",
  /* The three that reach Max and Growth. Omitting them here does not merely lose a feature —
     `questionPriority` is enum-constrained, so the model could not RANK them at all, and the
     adaptivity built around them would have been half-disabled while looking fine. */
  "volume",
  "extras",
] as const;

/**
 * Signals the model may read straight out of the free text, and the ONLY values it may use.
 *
 * These are copied from the `resolves` payloads in src/lib/questions.ts and must stay
 * identical to them. That is the whole safety property: a prefill is indistinguishable from
 * the answer a person would have given by tapping, so nothing downstream — rules.ts,
 * features.ts — can tell the difference or needs to.
 *
 * WHY THIS EXISTS. Before it, someone who wrote "we take cake orders over Instagram and need
 * a website" was still asked "Where do customers reach you today?" and "What needs standing
 * up first?". They had already answered both, in their own words, on screen one. The engine
 * had no way to know: `kickOff` seeded only industry, brandName and teamSize, so all six
 * question signals stayed unresolved no matter what the text said.
 *
 * FOUR SIGNALS ARE DELIBERATELY ABSENT, and it is the same argument each time: never infer a
 * price increase from prose.
 *
 * `attachmentVolume`, `extras` and `catalogueSize` each raise a floor to Max or Growth — a 4x
 * jump on mail, 2.5x on site. A description mentioning a photography studio invites "large
 * files often", and one mentioning quotes invites "sends invoices", but both would be us
 * deciding somebody needs the most expensive plan on the strength of a sentence they wrote
 * about themselves. These are behavioural questions and they are always asked. The guess
 * screen shows prefills so they are correctable, but a wrong prefill on these is a wrong PRICE,
 * and the asymmetry is not worth the saved tap.
 *
 * A consequence worth stating: `MAX_PREFILL = 3` can never bind against the current bank,
 * because only four signals are prefillable at all. The cap stays as a guard for when the bank
 * grows again.
 *
 * `mailboxCount` IS DELIBERATELY ABSENT and must stay absent. It is the heaviest signal and a
 * straight multiplier on price, and the only thing free text ever offers is headcount —
 * "there are three of us". Inferring a mailbox count from that reintroduces exactly the bug
 * the teamSize -> mailboxCount rename fixed, in the direction that undercharges and caps
 * people wrong. It is always asked.
 */
const PREFILL_VALUES = {
  importIntent: ["none", "emails", "both", "contacts"],
  surface: ["mail", "both"],
  customerChannel: ["social", "personal_email", "offline", "site"],
  currentClient: ["gmail", "outlook", "apple", "none"],
} as const;

/**
 * Which question a prefilled signal lets us SKIP.
 *
 * `currentClient` is deliberately absent: the `client` question was removed once measurement
 * showed it changed neither the plan nor the reveal, so reading "one shared Gmail" out of the
 * description skips nothing. The signal is still extracted — features.ts reads it — but it
 * must not consume one of the MAX_PREFILL slots, which exist to save SCREENS. Spending one on
 * a question that no longer exists would crowd out a prefill that saves a real one.
 */
const SIGNAL_TO_QUESTION: Record<string, string> = {
  importIntent: "import",
  surface: "surface",
  customerChannel: "channel",
  sellsOnline: "sells",
};

/**
 * At most three signals may be prefilled, however much the text says.
 *
 * Not a safety limit — a pacing one. Six signals and `MAX_QUESTIONS = 4`: prefilling three
 * still leaves three to ask, and every signal ends up resolved either way. Prefilling four
 * would leave a two-question flow, which reads as the product giving up rather than being
 * clever.
 *
 * Was 2, which was too tight and lost real information. A florist who wrote "orders come
 * through Instagram DMs and we take payment online" had `surface` and `customerChannel`
 * prefilled, and `sellsOnline` — which the model HAD extracted — silently discarded by the
 * cap. The model then ranked `sells` last, reasonably, because it believed it had already
 * answered it. So the signal was dropped by the cap and deprioritised by the ranking, and the
 * reveal recommended a site plan without knowing they take payments.
 *
 * Anything the cap does drop is now recorded, because a signal lost this way is invisible
 * otherwise — it looks identical to a signal the text never mentioned.
 */
const MAX_PREFILL = 3;

/** Matches src/lib/domains.ts TLDS. The stem is the model's; the TLDs are not its business. */
const TLDS = ["com", "in", "co", "co.site"] as const;
/** The ending each suggested NAME is offered on. The alternates come from the live lookup. */
const PRIMARY_TLD = "com";
const COSITE_SUFFIX = "co.site";

/**
 * The `.co.site` note is ours, never the model's.
 *
 * It states a price ("free"), and CLAUDE.md rule 2 is that the model never decides one. It is
 * also a fixed product fact rather than something to phrase per business, so there is nothing
 * for a model to add. `domainNotes` covers the three registrable TLDs only.
 */
const COSITE_NOTE = "Free for your first billing cycle — Neo's own, and live today";

/** What the free text already answered. Every field optional; null means "not stated". */
export interface Prefill {
  importIntent?: string | null;
  surface?: string | null;
  customerChannel?: string[] | null;
  currentClient?: string[] | null;
  sellsOnline?: boolean | null;
}

interface ModelProfile {
  summary: string;
  industry: (typeof INDUSTRIES)[number];
  /** Headcount, and ONLY headcount — never a mailbox count. See the system prompt. */
  teamSize: number | null;
  location: string | null;
  domainStem: string;
  /**
   * THREE DIFFERENT NAME IDEAS, not one name with three endings.
   *
   * `domainStem` alone produced the "the suggestions aren't personalised" feedback: the
   * reveal built its list as stem + .com / .in / .co, so a business only ever saw one name.
   * When the popular endings were taken — `cinematickets.com`, `.in` and `.co` all were —
   * the list collapsed to a single chip. Three stems means three real alternatives, and the
   * lookup checks each of them across the same TLDs for one credit apiece.
   */
  domainStems: string[];
  suggestedMailboxes: string[];
  /**
   * All nine question ids, most worth asking first.
   *
   * Was `nextQuestionId`, a single pick — and App.tsx nulled it after one use, so questions
   * 2, 3 and 4 came from `nextQuestion`'s weight fallback. That fallback is a `reduce` over a
   * fixed array with fixed weights, so it produced the SAME four questions in the SAME order
   * for every business on earth (team, surface, channel, sells) and `import` and `client`
   * were never reachable at all. An ordered list, consumed head-first for the whole flow, is
   * what makes "different businesses get different paths" true rather than aspirational.
   */
  questionPriority: (typeof QUESTION_IDS)[number][];
  /** Signals the text already answered. Validated hard below. */
  prefill: Prefill;
  /** One short line per TLD saying why it is worth considering. Copy, never price. */
  domainNotes: string[];
  /** One short line per mailbox saying what it is for. */
  mailboxLabels: string[];
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
    "domainStems",
    "suggestedMailboxes",
    "mailboxLabels",
    "questionPriority",
    "prefill",
    "domainNotes",
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
    domainStems: {
      type: "array",
      minItems: 3,
      maxItems: 3,
      items: { type: "string" },
      description:
        "THREE DIFFERENT name ideas, same rules as domainStem. Genuinely different names, " +
        "not the same word twice. Put the strongest first — it becomes their email address.",
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
    questionPriority: {
      type: "array",
      minItems: 9,
      maxItems: 9,
      items: { type: "string", enum: [...QUESTION_IDS] },
      description:
        "All eight question ids, each exactly once, ordered by how much asking it would tell " +
        "us about THIS business that the description does not already say. Put a question " +
        "LAST if the description already answers it.",
    },
    /* Strict mode requires every property listed in `required`, so "not stated" has to be an
       explicit null rather than an absent key. */
    prefill: {
      type: "object",
      additionalProperties: false,
      required: ["importIntent", "surface", "customerChannel", "currentClient", "sellsOnline"],
      properties: {
        importIntent: {
          type: ["string", "null"],
          enum: [...PREFILL_VALUES.importIntent, null],
          description: "Only if they say they are moving existing mail or contacts across.",
        },
        surface: {
          type: ["string", "null"],
          enum: [...PREFILL_VALUES.surface, null],
          description:
            "'both' only if they ask for a website or say they have none. 'mail' only if " +
            "they say email is all they want. Wanting to be found online is not enough.",
        },
        customerChannel: {
          type: ["array", "null"],
          items: { type: "string", enum: [...PREFILL_VALUES.customerChannel] },
          description:
            "Every channel they NAME. Instagram/WhatsApp/Facebook DMs -> social. A Gmail or " +
            "Hotmail address -> personal_email. Phone, walk-ins, market stalls -> offline. " +
            "An existing website -> site.",
        },
        currentClient: {
          type: ["array", "null"],
          items: { type: "string", enum: [...PREFILL_VALUES.currentClient] },
          description: "Only a mail app they NAME. Not inferred from anything else.",
        },
        sellsOnline: {
          type: ["boolean", "null"],
          description:
            "true only if money changes hands online — orders, payments, bookings paid for. " +
            "Taking enquiries or reservations without payment is false. Unclear is null.",
        },
      },
    },
    domainNotes: {
      type: "array",
      minItems: 3,
      maxItems: 3,
      items: { type: "string" },
      description:
        "One short reason per NAME, in the same order as domainStems. Never mention price.",
    },
  },
} as const;

const SYSTEM = [
  "You read a one-or-two sentence description of a small business and return a structured",
  "profile. You are the only model step in this product.",
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
  "Two fields decide what this person gets asked next. They are the most important thing you",
  "return, because asking someone a question they just answered in their own words is the",
  "fastest way to look like nothing was read.",
  "",
  "questionPriority ranks all nine questions, most worth asking first. The nine are:",
  "  import  - are they bringing existing mail or contacts across",
  "  surface - do they need email only, or email and a website",
  "  channel - where customers reach them today",
  "  client  - which mail app they use now",
  "  team    - how many email addresses they need",
  "  sells   - do people pay them online",
  "  volume  - what they send: messages, documents, or large files (drives storage)",
  "  extras  - whether they invoice, run campaigns, take bookings, or track opens",
  "  catalogue - how many products or services they would list on a site",
  "Rank by what the description leaves OPEN. A question whose answer is already in the text",
  "goes last. A question whose answer would change what this specific business needs goes",
  "first. Do not use a fixed order; a bakery and a law firm should not be ranked the same.",
  "",
  "prefill is what the description ALREADY answers. Use it only for facts stated or plainly",
  "implied — never a guess about what a business like theirs probably does. A wrong prefill",
  "silently skips a question and puts an answer they never gave into their recommendation,",
  "which is worse than asking one question too many. When in doubt, return null.",
  "  STATED:     'we take orders on Instagram'      -> customerChannel ['social']",
  "  STATED:     'moving off Gmail'                 -> currentClient ['gmail']",
  "  STATED:     'we need a website too'            -> surface 'both'",
  "  NOT STATED: a restaurant, so probably takeaway -> sellsOnline null",
  "  NOT STATED: small, so probably no site yet     -> surface null",
  /* Added after a production run: "cinema ticket reseller from bandra, NO WEBSITE, just me"
     was prefilled `surface: 'both'` and sold a Plus site. The model read a phrase about not
     having a site as evidence of wanting one, and because prefilling SKIPS the question, the
     person was never given the chance to say otherwise. */
  "  'no website' / 'don't have a site' describes what they HAVE, not what they WANT.",
  "  It is not evidence for surface 'both'. If they have no site and have not said whether",
  "  they want one, surface is null and the question gets asked.",
  "  STATED:     'no website, just me'              -> surface null  (ask them)",
  "  STATED:     'we don't want a website'          -> surface 'mail'",
  "Never prefill how many mailboxes they need. A separate question asks it, and headcount is",
  "not the same number.",
  "",
  "domainStems is THREE DIFFERENT NAMES, and this matters more than it sounds. They are shown",
  "side by side as the alternatives, so three variations of one word reads as one suggestion",
  "repeated. Vary the idea, not the spelling: the business name, what they do, and where they",
  "are, are three different names. Put the strongest first — it becomes their email address.",
  "  GOOD: ['cinematickets', 'bandratickets', 'ticketreseller']",
  "  BAD:  ['cinematickets', 'cinematicket', 'cinematicketsonline']",
  "",
  "Write summary in the customer's own register. Plain, specific, no marketing language.",
].join("\n");

const STOPWORDS = new Set([
  "the", "and", "for", "our", "was", "are", "with", "from", "that", "this", "have",
  "has", "were", "they", "you", "your", "run", "runs", "own", "small", "business",
  "company", "into", "over", "all", "who", "how", "get", "gets", "there",
]);

/**
 * What to show when the model call fails.
 *
 * Summary is their own words, reshaped into the Guess-screen noun phrase — never a blank,
 * never the bakery fixture. Industry, headcount and prefills stay empty: an unresolved
 * industry leaves the ring lower and makes the engine ask more, which is the correct
 * behaviour when we genuinely do not know. Inventing those would skip questions on facts
 * we never read.
 */
function derivedProfile(businessText: string): ModelProfile {
  const words = businessText
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));

  return {
    summary: deriveGuessSummary(businessText),
    industry: "" as ModelProfile["industry"],
    teamSize: null,
    location: null,
    domainStem: words.slice(0, 2).join("") || "yourbusiness",
    /* Three from the same words rather than one repeated: even the degraded path should not
       offer the same name three times over. */
    domainStems: [
      words.slice(0, 2).join("") || "yourbusiness",
      words.slice(0, 1).join("") || "yourbusiness",
      words.slice(0, 3).join("") || "yourbusinessco",
    ],
    suggestedMailboxes: ["hello", "contact"],
    mailboxLabels: ["For enquiries and new customers", "For everything else"],
    /* Empty, not a guessed order: when the call failed we know nothing about this business,
       and the engine's weight fallback is the honest default. Prefill likewise stays empty —
       skipping a question on a fact we never read would be inventing an answer. */
    questionPriority: [],
    prefill: {},
    domainNotes: ["The one people will guess", "Reads as local", "Short, room to grow"],
  };
}

/**
 * Keep only prefills whose value is in the fixed vocabulary, capped at MAX_PREFILL.
 *
 * Everything here is a drop, never a repair — same rule as questionService. An out-of-enum
 * value means the model misread the contract, and mapping it to the nearest option would put
 * an answer the person never gave into a priced recommendation.
 *
 * Returns the profile patch (values in exactly the shape `resolves` would have produced) and
 * the question ids those signals close, so the engine can skip them.
 */
/**
 * Phrases that describe NOT having a site. Deliberately narrow: it only has to catch the
 * plain ways someone says it, and a false positive costs one extra question while a false
 * negative costs them a site they never asked for.
 */
/* The leading \b is load-bearing: without it "casino site" matches the "no" inside
   "casino", and a business that mentions one would lose its site question. */
const NO_SITE_PHRASE =
  /\b(?:no|without|don'?t\s+have|dont\s+have|do(?:es)?\s+not\s+have|haven'?t\s+got|not\s+got)(?:\s+an?)?\s+(?:web\s?site|site|web\s?page)\b/i;

function validatePrefill(raw: Prefill | undefined, businessText: string): {
  profile: Record<string, string | string[] | boolean>;
  skip: string[];
  dropped: string[];
} {
  const profile: Record<string, string | string[] | boolean> = {};
  const skip: string[] = [];
  const dropped: string[] = [];
  const p = { ...(raw ?? {}) };

  /**
   * "No website" is not a request for a website.
   *
   * A production run described a business as "cinema ticket reseller from bandra, no website,
   * just me" and came back with `surface: 'both'` prefilled — so the surface question was
   * SKIPPED, and the person was sold a Plus site off the back of a phrase saying they did not
   * have one. Prefilling is what made it unrecoverable: a wrong prefill removes the question
   * that would have corrected it.
   *
   * The system prompt now says this too, but a prompt is guidance and this decides what
   * someone pays, so the guard is here as well. It nulls the signal rather than flipping it to
   * 'mail': not having a site genuinely does not say whether they want one, and the honest
   * response to an ambiguous phrase is to ask, not to infer in the other direction.
   */
  if (p.surface === "both" && NO_SITE_PHRASE.test(businessText)) {
    dropped.push("surface: text says no site, asking instead");
    p.surface = null;
  }

  /* Weight order, so that when the cap bites we keep the signals that move the
     recommendation most rather than whichever the model happened to list first. */
  const order = ["surface", "customerChannel", "sellsOnline", "importIntent", "currentClient"];

  for (const signal of order) {
    const value = p[signal as keyof Prefill];
    if (value === null || value === undefined) continue;
    /* Cap reached, but the model DID extract this. Record it: dropped-by-cap and
       never-mentioned are the same silence otherwise, and only one of them is a design
       choice. The question stays askable, so the fact is deferred, not lost. */
    if (SIGNAL_TO_QUESTION[signal] && skip.length >= MAX_PREFILL) {
      dropped.push(`${signal}: over MAX_PREFILL, asking instead`);
      continue;
    }

    if (signal === "sellsOnline") {
      if (typeof value !== "boolean") {
        dropped.push(`sellsOnline: not a boolean`);
        continue;
      }
      profile.sellsOnline = value;
      skip.push(SIGNAL_TO_QUESTION[signal]);
      continue;
    }

    const allowed = PREFILL_VALUES[signal as keyof typeof PREFILL_VALUES] as readonly string[];
    if (Array.isArray(value)) {
      const kept = value.filter((v) => allowed.includes(String(v))).map(String);
      const bad = value.filter((v) => !allowed.includes(String(v)));
      if (bad.length) dropped.push(`${signal}: ${bad.map(String).join(",").slice(0, 40)}`);
      if (!kept.length) continue;
      profile[signal] = kept;
    } else {
      if (!allowed.includes(String(value))) {
        dropped.push(`${signal}: ${String(value).slice(0, 24)}`);
        continue;
      }
      profile[signal] = String(value);
    }
    const q = SIGNAL_TO_QUESTION[signal];
    if (q) skip.push(q);
  }

  return { profile, skip, dropped };
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
      maxOutputTokens: 15000,
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
      mode: process.env.LLM_MODE ?? "replay",
      chars: businessText.length,
      degraded,
      ...(reason ? { reason: reason.slice(0, 200) } : {}),
    }),
  );

  const stem = cleanStem(profile.domainStem);
  /**
   * Three distinct stems, first one always `stem` so the mailboxes and the handoff agree.
   *
   * Deduped and padded: a model that returns the same idea twice would otherwise put the same
   * name on screen twice, and a short list would leave a gap where a suggestion should be.
   */
  const stems = (() => {
    const out: string[] = [stem];
    for (const raw of profile.domainStems ?? []) {
      const c = cleanStem(raw);
      if (c && c !== "yourbusiness" && !out.includes(c)) out.push(c);
      if (out.length === 3) break;
    }
    /* Pad from the mailbox locals rather than repeating: "hellocinematickets" is a worse name
       than the model's, but it is at least a different one, and this only runs when the model
       gave us fewer than three usable ideas. */
    for (const extra of ["get", "my", "the"]) {
      if (out.length >= 3) break;
      const c = cleanStem(`${extra}${stem}`);
      if (!out.includes(c)) out.push(c);
    }
    return out.slice(0, 3);
  })();
  const locals = (profile.suggestedMailboxes ?? [])
    .map((m) => String(m).toLowerCase().replace(/[^a-z0-9]/g, ""))
    .filter(Boolean)
    .slice(0, 3);
  const mailboxLocals = locals.length ? locals : ["hello", "contact"];
  const primary = `${stem}.${TLDS[0]}`;

  const prefill = validatePrefill(profile.prefill, businessText);
  /* Dedupe and drop anything that is not a real question id. The engine re-checks both, but
     a malformed list would otherwise sit in the snapshot and in the logs looking valid. */
  const priority = Array.from(new Set(profile.questionPriority ?? [])).filter((id) =>
    QUESTION_IDS.includes(id as never),
  );

  /* Logged separately from the line above because it is answering a different question:
     not "did the call work" but "is the flow actually adapting". `priority` and `skip`
     varying across sessions is the evidence that it is; both empty on every request means
     we have quietly gone back to asking everyone the same four questions. */
  console.error(
    "[profile-adapt]",
    JSON.stringify({
      sid,
      priority: priority.join(","),
      skip: prefill.skip.join(","),
      ...(prefill.dropped.length ? { dropped: prefill.dropped.join(" | ").slice(0, 200) } : {}),
    }),
  );


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
      questionPriority: priority,
      prefill: prefill.profile,
      prefilledQuestionIds: prefill.skip,
      reveal: {
        /* priceInr AND available are both null, and that is the point: the model produces
           neither. `/api/domains` fills them from DomScan when the reveal mounts, and until
           it does Reveal.tsx renders no price and no badge rather than a wrong one.
           `available` was `true` here once, "optimistic for the first paint" — which meant a
           failed lookup showed a green Available on a domain that was actually taken. An
           unverified claim about something a person can check in one keystroke is the worst
           kind to get wrong. */
        /**
         * THREE DIFFERENT NAMES, then `.co.site` — not one name with four endings.
         *
         * This was `TLDS.map(tld => `${stem}.${tld}`)`, which is why the suggestions never
         * felt personalised: every business got its single stem on .com, .in and .co. It also
         * meant the whole list shared one fate — `cinematickets` was taken on all three
         * popular endings, so a production run showed exactly one registrable name.
         *
         * `.com` for each name because it is the one people assume; when a `.com` is taken,
         * `availableFromLookup` drops it and backfills from the same batch, which now holds
         * every stem crossed with every TLD rather than just the one.
         */
        domains: [
          ...stems.map((st, i) => ({
            name: `${st}.${PRIMARY_TLD}`,
            available: null,
            priceInr: null,
            note: profile.domainNotes?.[i] ?? undefined,
            recommended: i === 0,
          })),
          {
            /* Neo's own namespace keeps the reserved last slot, and keeps the FIRST stem:
               it is the name their mailboxes are built on. */
            name: `${stem}.${COSITE_SUFFIX}`,
            available: null,
            priceInr: null,
            /* Free-ness is a product fact, not a lookup result, so it is set on the first paint
               rather than waiting for a check that can never return "free" anyway. */
            free: true,
            note: COSITE_NOTE,
            recommended: false,
          },
        ],
        mailboxes: mailboxLocals.map((local, i) => ({
          address: `${local}@${primary}`,
          label: profile.mailboxLabels?.[i] ?? "",
        })),
        /* Reveal.tsx does not read this — it renders Neo's real generated site instead, and
           CLAUDE.md is explicit that we do not write site copy. Kept only because
           RevealContent requires the field. */
        site: { headline: "", subhead: "", sections: [] },
      },
      degraded,
    },
  };
}

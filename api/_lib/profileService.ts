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

/**
 * The fixed question structure, mirrored from src/lib/questions.ts.
 *
 * The model rewrites WORDS against these ids. It never sees or supplies a `resolves` value,
 * an option id it could invent, a weight, or a signal — so no generation can change what an
 * answer means, only how it reads. Anything the model returns that is not an id below is
 * dropped, and a question that loses too much falls back to the fixed bank verbatim.
 *
 * If you add or rename an option in questions.ts, update this. A mismatch is safe (the
 * override is dropped) but silently costs you the generated wording for that option.
 */
const QUESTION_SHAPE: Record<string, { prompt: string; options: Record<string, string> }> = {
  import: {
    prompt: "Bringing anything with you?",
    options: {
      none: "No, I'll start fresh",
      emails: "Yes, my emails",
      both: "Emails and contacts",
      contacts: "Just my contacts",
    },
  },
  surface: {
    prompt: "What needs standing up first?",
    options: { mail: "Just email", both: "Email and a site" },
  },
  channel: {
    prompt: "Where do customers reach you today?",
    options: {
      social: "Social DMs",
      personal: "A personal email address",
      phone: "Phone or in person",
      site: "I already have a website",
    },
  },
  client: {
    prompt: "What do you use for mail right now?",
    options: {
      gmail: "Gmail",
      outlook: "Outlook",
      apple: "Apple Mail",
      none: "Nothing set up yet",
    },
  },
  team: {
    prompt: "How many email addresses do you need?",
    options: {
      "1": "Just one",
      "2": "Two",
      "3-5": "Three to five",
      "6+": "More than five",
    },
  },
  sells: {
    prompt: "Do people pay you online?",
    options: { yes: "Yes, I take orders or payments", enquiry: "No, they enquire first" },
  },
};

/**
 * The structure, rendered for the prompt.
 *
 * Built from QUESTION_SHAPE rather than written out again, so the list the model is given can
 * never drift from the list validation enforces. Without this the model invents plausible ids
 * — `channel_social`, `team_1` — every override is dropped, and the feature silently does
 * nothing while looking like it worked. Safe, but useless; that failure cost a round trip.
 *
 * The current label goes in too, because the model is not just picking an id: it has to
 * preserve what that option MEANS while changing how it reads.
 */
const SHAPE_FOR_PROMPT = Object.entries(QUESTION_SHAPE)
  .map(([qid, q]) => {
    const opts = Object.entries(q.options)
      .map(([oid, label]) => `      ${oid} = currently "${label}"`)
      .join("\n");
    return `  questionId "${qid}" — currently "${q.prompt}"\n${opts}`;
  })
  .join("\n");

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
  /** Reworded questions for this specific business. Surface only. */
  questions: ModelQuestion[];
}

interface ModelQuestion {
  questionId: string;
  prompt: string;
  sub: string;
  placeholder: string;
  options: { optionId: string; label: string; hint: string }[];
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
    /* strict mode requires EVERY property here, not just the mandatory-feeling ones. */
    "questions",
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
    questions: {
      type: "array",
      minItems: 6,
      maxItems: 6,
      description:
        "All six questions, reworded for THIS business. Keep every questionId and every " +
        "optionId exactly as given; you are rewriting words, not structure.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["questionId", "prompt", "sub", "placeholder", "options"],
        properties: {
          questionId: {
            type: "string",
            enum: ["import", "surface", "channel", "client", "team", "sells"],
          },
          prompt: { type: "string", description: "The question. Under 60 characters." },
          sub: { type: "string", description: "One clarifying line. Under 90 characters." },
          placeholder: {
            type: "string",
            description: "Free-text box placeholder, phrased as an invitation.",
          },
          options: {
            type: "array",
            minItems: 2,
            maxItems: 4,
            items: {
              type: "object",
              additionalProperties: false,
              required: ["optionId", "label", "hint"],
              properties: {
                optionId: { type: "string" },
                label: { type: "string", description: "Under 34 characters." },
                hint: {
                  type: "string",
                  description: "Under 46 characters. Empty string if it adds nothing.",
                },
              },
            },
          },
        },
      },
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
  "REWRITING THE QUESTIONS. You get all six and you rewrite them for this business: the",
  "question, the clarifying line, the free-text placeholder, and every option's label and",
  "hint. Return every questionId and every optionId exactly as given. You are rewriting",
  "words, never structure, and never what an option means.",
  "",
  "The rule that matters more than the rest: AN OPTION DESCRIBES THE CUSTOMER'S OWN",
  "SITUATION. It never describes what this product does and never promises a capability.",
  "You do not know what this product can do, and a label that guesses is a lie someone",
  "reads before they pay.",
  "  GOOD: 'Instagram, WhatsApp and Twitter'  - a fact about them",
  "  GOOD: 'Walk-ups at the box office'       - a fact about them",
  "  BAD:  'Sell tickets on your site'        - a promise about us",
  "  BAD:  'Sync your booking system'         - invents an integration",
  "  BAD:  'Get unlimited storage'            - invents a plan detail",
  "Keep each option's meaning identical to the one it replaces. If the original meant they",
  "already have a website, yours must still mean that, in their words.",
  "",
  "Say back what they told you: a cinema that mentioned Instagram and WhatsApp should see",
  "those named. Never invent a channel, a tool, or a fact they did not give you.",
  "",
  "Two things that make the rewrite worse, so avoid both. Do not staple the business noun",
  "onto every line — 'Just cinema email', 'cinema mail', 'cinema addresses' reads like a mail",
  "merge; the context is already obvious from the screen. And a hint must ADD something the",
  "label does not already say. 'Gmail' does not need the hint 'you use Gmail'. Return an",
  "empty hint rather than restating the label.",
  "",
  "These are the six questions and their EXACT ids. Use these ids verbatim. Do not invent an",
  "id, do not add or drop options, and keep each option meaning what it means now:",
  SHAPE_FOR_PROMPT,
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
    /* No generated wording: every question falls back to the fixed bank. */
    questions: [],
  };
}

/** Slug guard. The stem lands in a domain name and in Neo's handoff URL. */
function cleanStem(raw: unknown): string {
  const s = String(raw ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  return s.slice(0, 24) || "yourbusiness";
}

/**
 * Keep only what is provably safe, and say what was thrown away.
 *
 * Everything here is a drop, never a repair. A model that returns an unknown optionId has
 * misunderstood the structure, and guessing which option it meant would reintroduce exactly
 * the risk that fixed ids exist to remove.
 *
 * A question left with fewer than 2 usable options is dropped whole, so it renders from the
 * fixed bank verbatim. That is the floor the whole feature stands on: a bad generation
 * degrades to what ships today, never to a broken screen.
 */
function validateQuestions(raw: ModelQuestion[] | undefined): {
  surface: Record<string, unknown>;
  dropped: string[];
} {
  const surface: Record<string, unknown> = {};
  const dropped: string[] = [];

  for (const q of raw ?? []) {
    const shape = QUESTION_SHAPE[q.questionId];
    if (!shape) {
      dropped.push(`unknown questionId ${String(q.questionId).slice(0, 24)}`);
      continue;
    }

    const options: Record<string, { label?: string; hint?: string }> = {};
    let kept = 0;
    for (const o of q.options ?? []) {
      if (!(o.optionId in shape.options)) {
        dropped.push(`${q.questionId}: unknown optionId ${String(o.optionId).slice(0, 24)}`);
        continue;
      }
      if (options[o.optionId]) {
        dropped.push(`${q.questionId}: duplicate optionId ${o.optionId}`);
        continue;
      }
      options[o.optionId] = {
        label: String(o.label ?? "").slice(0, 34),
        hint: String(o.hint ?? "").slice(0, 46),
      };
      kept++;
    }

    if (kept < 2) {
      dropped.push(`${q.questionId}: ${kept} usable options, keeping the fixed wording`);
      continue;
    }

    surface[q.questionId] = {
      prompt: String(q.prompt ?? "").slice(0, 80),
      sub: String(q.sub ?? "").slice(0, 120),
      placeholder: String(q.placeholder ?? "").slice(0, 90),
      options,
    };
  }

  return { surface, dropped };
}

export interface ProfileServiceResult {
  status: number;
  body: Record<string, unknown>;
}

export async function handleProfile(businessTextRaw: unknown): Promise<ProfileServiceResult> {
  const businessText = String(businessTextRaw ?? "").slice(0, 2000);
  if (businessText.trim().length < 8) {
    return { status: 400, body: { error: "businessText too short" } };
  }

  let profile: ModelProfile;
  let degraded = false;

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
    /* Greppable in `npx vercel logs`, same convention as /api/log. */
    console.error("[profile-degraded]", err instanceof Error ? err.message : String(err));
    profile = derivedProfile(businessText);
    degraded = true;
  }

  const { surface, dropped } = validateQuestions(profile.questions);
  if (dropped.length) console.error("[surface-dropped]", dropped.join(" | ").slice(0, 500));

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
        /* priceInr is null on every entry, and that is the point: the model is not allowed
           to produce a price. `/api/domains` fills these from DomScan when the reveal
           mounts, and Reveal.tsx renders no price rather than a wrong one until it does.
           `available` is optimistic for the first paint and corrected by the same call. */
        domains: TLDS.map((tld, i) => ({
          name: `${stem}.${tld}`,
          available: true,
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
      /**
       * Model-written wording by question id, already validated. Absent entries render
       * from the fixed bank, so a partial generation is a partial improvement rather
       * than a partial breakage.
       */
      surface,
      degraded,
      /* Greppable record of what validation refused. */
      ...(dropped.length ? { surfaceDropped: dropped } : {}),
    },
  };
}

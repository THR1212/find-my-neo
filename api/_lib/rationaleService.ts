/**
 * The one call that sees the WHOLE run: the description, every answer, and the plan already
 * chosen for them. It writes the two sentences under the price on the reveal.
 *
 * Every other model call in this project is fired at screen-1 submit and knows only the free
 * text. That is deliberate — see docs/llm-flow.md — but it leaves the reveal explaining itself
 * with `buildRationale`'s four hand-written templates, which cannot mention a single thing the
 * person actually answered. This is the one place where full context changes something a
 * person would notice, and it is the last screen, so it costs nothing on the way in.
 *
 * IT EXPLAINS THE PLAN. IT NEVER SELECTS ONE.
 *
 * `rules.ts` has already decided, from `plans.json` and Pandora entitlements, before this is
 * called. The plan, the price and the mailbox count arrive here as **given facts in the user
 * payload**, never as a question. That keeps CLAUDE.md rule 2 intact at the exact point where
 * it would be most tempting to break: the model is closest to the money here, and furthest
 * from being able to touch it.
 *
 * Fourth instance of the same split:
 *   what the plan IS      FIXED       rules.ts + plans.json
 *   the price             FIXED       plans.json, computed, never sent to be reasoned about
 *   how we EXPLAIN it     GENERATED
 *
 * TIMING. Fired when the last question is answered, so it overlaps Neo's 22-38s generator.
 * Unlike the other three it has **no recorded fallback of its own** — so `buildRationale` is
 * kept and rendered while this is in flight and whenever it fails. A blank line on the one
 * screen that must be perfect is a worse outcome than a generic one.
 */

import { complete } from "./llm.js";

/**
 * What someone gives up by dropping one tier, from `src/data/plan-features.json`.
 *
 * Supplied to the model rather than left to it, because "what does the cheaper plan lack" is
 * exactly the kind of question a model answers plausibly and wrongly.
 *
 * HAND-MAINTAINED, and the comment used to imply otherwise. Every row was checked against
 * `plan-features.json` and `site-features.json` on 03 Sep, at Hari's request — "if we are
 * unsure we shouldn't show this" — and three of the four held exactly:
 *
 *   max    -> Standard   invoice_builder / titan_ai / email_marketing are all "MAX ONLY"
 *   plus   -> Basic      Contact Forms, Testimonials, Remove Neo Branding are all null on basic
 *   growth -> Plus       products, services, gallery all 500 on plus and Unlimited on growth;
 *                        Font themes Standard on plus, Premium on growth
 *
 * The fourth did not. `standard` claimed "unlimited email templates", and NO email-template
 * entitlement exists anywhere in the recorded Pandora data — it was plausible and unsourced,
 * the exact failure this table exists to prevent, sitting inside it. Replaced with
 * `drive_storage`, which is recorded ("Standard 1,024 and Max 51,200. Absent from Starter")
 * and is also the stronger line: docs/data-findings.md §5 has storage as the dominant paywall
 * trigger in every industry.
 *
 * If a row is edited, re-check it against the JSON. This is a claim about what someone loses
 * by spending less, printed while they decide.
 *
 * Darrel's competitor research is why this line exists at all: Cynet recommends one plan and
 * lists the others, and Mailchimp and Rinda both justify the recommendation rather than just
 * naming it. Pre-empting "why not the cheap one" is a pattern all three ship.
 */
const CHEAPER_TIER: Record<string, { cheaper: string; loses: string }> = {
  standard: {
    cheaper: "Neo Starter",
    loses: "the signature designer, company branding, and the extra mailbox storage",
  },
  max: {
    cheaper: "Neo Standard",
    loses: "the invoice builder, the AI email writer, and campaign sending",
  },
  plus: {
    cheaper: "Basic",
    loses: "the contact form entirely, plus testimonials and removing Neo's branding",
  },
  growth: {
    cheaper: "Plus",
    loses: "unlimited products, services and gallery images, and premium fonts",
  },
};

interface ModelRationale {
  rationale: string;
  whyNotCheaper: string;
  /** One line that carries the whole justification. See the schema note. */
  because: string;
}

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["rationale", "whyNotCheaper", "because"],
  properties: {
    rationale: {
      type: "string",
      description:
        "One sentence saying why this shape of setup fits THIS business, referring to what " +
        "they actually told you. Under 130 characters. Ends with a full stop. Never states " +
        "a price, a number of rupees, or a plan name.",
    },
    whyNotCheaper: {
      type: "string",
      description:
        "One sentence saying what the cheaper plan would cost them in capability, using ONLY " +
        "the loses list given. Under 130 characters. Empty string if no cheaper plan was " +
        "given. Never states a price.",
    },
    /**
     * The reveal was a stack: a rationale sentence, then a bulleted needs list, then a
     * why-not-cheaper line, then a cycle line, then a domain note. Five blocks saying
     * overlapping things, and the screen was too tall to read.
     *
     * `because` replaces the first three with one line. Its STRUCTURE is fixed — it may only
     * use the reasons the solver already computed, which is why the prompt hands them over
     * and forbids anything else. That keeps the justification checkable: every clause traces
     * to a binding need, exactly as the bullets did, without three separate paragraphs.
     */
    because: {
      type: "string",
      description:
        "ONE sentence, under 180 characters, joining the reasons in `needs` into something a " +
        "person would say out loud — and naming the single reason that mattered most FIRST. " +
        "Use only those reasons; never add one. Never state a price, a plan name, or a " +
        "number of rupees.",
    },
  },
} as const;

const SYSTEM = [
  "You write the two sentences that sit under a price on a recommendation screen, for one",
  "small business that has just answered a few questions.",
  "",
  "THE PLAN IS ALREADY DECIDED. It was computed by deterministic code from the business's",
  "answers and from the provider's real pricing. You are told what it is so you can EXPLAIN",
  "it. You are not being asked whether it is right, and you must never suggest a different",
  "plan, a different number of mailboxes, or a different billing period.",
  "",
  "NEVER WRITE A PRICE. No rupee figures, no 'from X', no 'only Y a month'. The screen prints",
  "the real price directly above your sentence; a number from you that disagrees with it is",
  "the single worst thing this screen can do.",
  "",
  "rationale: why this SHAPE fits them — the mailboxes they asked for, whether they wanted a",
  "site, what they told you about how customers reach them. Refer to their actual situation,",
  "in their own register. Not marketing language, not a feature list.",
  "  GOOD: 'Two addresses so bouquet orders stop landing in the same inbox as everything else.'",
  "  BAD:  'The perfect plan to supercharge your florist business.'",
  "",
  "because: one sentence carrying the whole justification, built ONLY from the `needs`",
  "reasons handed to you, heaviest first. It replaces a bulleted list, so it must not lose a",
  "reason and must not gain one.",
  "  GOOD: 'You quote every repair, and that is the part that needs Max — the rest is the site",
  "         and the photos you send.'",
  "  BAD:  'Perfect for growing businesses like yours.'   - says nothing they told us",
  "",
  "whyNotCheaper: what dropping to the cheaper plan would actually cost them. Use ONLY the",
  "capabilities listed in `cheaperPlanLoses`. Do not invent a limit, a feature, or a number.",
  "If no cheaper plan is given, return an empty string.",
  "  GOOD: 'The cheaper site plan has no contact form, so enquiries would still land in DMs.'",
  "  BAD:  'The cheaper plan only gives you 5GB.'   - invented",
  "",
  "Write plainly, as if explaining across a counter. No exclamation marks.",
].join("\n");

/** Digits that look like money or quantities we did not authorise. */
const PRICE_LIKE = /(₹|rs\.?\s*\d|\d[\d,]*\s*(?:\/|per\s)?\s*(?:mo|month|yr|year|gb|mb))/i;

/**
 * Drop anything unusable. The fixed rationale is behind every rejection, so dropping costs a
 * degraded line, never a blank one.
 *
 * The price check is the one that matters. A generated sentence naming a figure that
 * contradicts the real price printed directly above it would be worse than saying nothing —
 * so any price-shaped string is refused outright rather than trimmed.
 */
function validate(raw: ModelRationale | undefined): {
  rationale: string;
  whyNotCheaper: string;
  because: string;
  dropped: string[];
} {
  const dropped: string[] = [];
  const clean = (v: unknown, field: string, required: boolean): string => {
    const text = String(v ?? "").trim();
    if (!text) {
      if (required) dropped.push(`${field}: empty`);
      return "";
    }
    if (text.length > 170) {
      dropped.push(`${field}: ${text.length} chars`);
      return "";
    }
    if (PRICE_LIKE.test(text)) {
      dropped.push(`${field}: contains a price or limit`);
      return "";
    }
    return text;
  };

  return {
    rationale: clean(raw?.rationale, "rationale", true),
    whyNotCheaper: clean(raw?.whyNotCheaper, "whyNotCheaper", false),
    /* Not required: an empty `because` falls back to the bullets, which is what shipped
       before this field existed. A missing summary must never blank the justification. */
    because: clean(raw?.because, "because", false),
    dropped,
  };
}

export interface RationaleInput {
  businessText?: unknown;
  /** What they were asked and what they picked, as displayed. From engine.trail. */
  answers?: { question?: unknown; answer?: unknown }[];
  mailPlanId?: unknown;
  mailPlanName?: unknown;
  sitePlanId?: unknown;
  sitePlanName?: unknown;
  mailboxes?: unknown;
}

export async function handleRationale(
  input: RationaleInput | undefined,
  sid = "none",
): Promise<{ status: number; body: Record<string, unknown> }> {
  const startedAt = Date.now();
  const businessText = String(input?.businessText ?? "").slice(0, 2000);
  if (businessText.trim().length < 8) {
    return { status: 400, body: { error: "businessText too short" } };
  }

  const answers = (Array.isArray(input?.answers) ? input.answers : [])
    .slice(0, 6)
    .map((a) => ({
      question: String(a?.question ?? "").slice(0, 120),
      answer: String(a?.answer ?? "").slice(0, 120),
    }))
    .filter((a) => a.question && a.answer);

  /* The cheaper tier is looked up from OUR table, never taken from the request — so a
     malformed payload cannot make the model describe a plan that does not exist. */
  const siteId = String(input?.sitePlanId ?? "");
  const mailId = String(input?.mailPlanId ?? "");
  const cheaper = CHEAPER_TIER[siteId] ?? CHEAPER_TIER[mailId] ?? null;

  const payload = {
    business: businessText,
    theirAnswers: answers,
    chosenPlan: {
      mail: String(input?.mailPlanName ?? "").slice(0, 40),
      site: input?.sitePlanName ? String(input.sitePlanName).slice(0, 40) : null,
      mailboxes: Number(input?.mailboxes) || 1,
    },
    cheaperPlanLoses: cheaper ? { plan: cheaper.cheaper, loses: cheaper.loses } : null,
  };

  let out: ModelRationale | undefined;
  let reason = "";
  try {
    out = await complete<ModelRationale>({
      key: "rationale",
      system: SYSTEM,
      user: JSON.stringify(payload),
      schema: SCHEMA as unknown as Record<string, unknown>,
      schemaName: "plan_rationale",
      maxOutputTokens: 900,
    });
  } catch (err) {
    reason = err instanceof Error ? err.message : String(err);
  }

  const { rationale, whyNotCheaper, because, dropped } = validate(out);

  console.error(
    "[rationale]",
    JSON.stringify({
      sid,
      ms: Date.now() - startedAt,
      model: process.env.LLM_MODEL ?? "default",
      answers: answers.length,
      wrote: rationale ? 1 : 0,
      cheaper: cheaper ? (siteId in CHEAPER_TIER ? siteId : mailId) : "none",
      ...(reason ? { reason: reason.slice(0, 200) } : {}),
      ...(dropped.length ? { dropped: dropped.join(" | ").slice(0, 200) } : {}),
    }),
  );

  /* Empty strings are a complete answer: the reveal keeps buildRationale's line. */
  return { status: 200, body: { rationale, whyNotCheaper, because } };
}

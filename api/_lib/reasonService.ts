/**
 * Rewrites the "why this matters to YOU" half of each feature line, for one business.
 *
 * A SEPARATE ROUTE, for the same reason questionService is one: latency placement.
 * `/api/questions` gates the first question screen (~14s), so anything added to it delays a
 * screen someone is waiting on. Reasons are not needed until the reveal, which is 30s+ away
 * and already waiting on Neo's 22-38s generator. Free real estate.
 *
 * THE SPLIT THIS PRESERVES — it is the whole safety property, and it is the same three layers
 * questionService uses:
 *
 *   which feature is shown   FIXED   (pickFeatures, deterministic, profile + plan entitlement)
 *   the feature NAME         FIXED   (Neo's own verbatim heading — never model-written)
 *   the `because` clause     GENERATED
 *
 * So a generation can change why we say something matters to this person. It can never
 * introduce a feature, rename one, or put one in front of someone whose plan lacks it —
 * `minMailPlan` / `minSitePlan` filtering happens after this and knows nothing about it.
 *
 * Anything unusable is DROPPED, and a dropped reason renders the hand-written string that
 * ships today. There is no state in which this feature makes the reveal worse than it was.
 */

import { complete } from "./llm.js";

/**
 * The features a reason may be written for: Neo's name, and what the current line MEANS.
 *
 * Mirrored from src/lib/features.ts. The current text is included because the model is not
 * inventing a benefit — it is re-expressing a fixed one for a specific business, and the
 * meaning has to survive. If you add a feature there, add it here; a mismatch is safe (the
 * override is dropped) but silently costs you the generated line.
 */
const FEATURE_SHAPE: Record<string, { name: string; means: string }> = {
  import_email_contacts: {
    name: "One-click import of existing emails & contacts",
    means: "their existing mail comes across, so nothing is lost in the move",
  },
  multi_device_support: {
    name: "Multi-account Support",
    means: "role addresses can live apart instead of in one personal inbox",
  },
  read_receipts: {
    name: "Read Receipts",
    means: "they can tell whether something they sent was actually opened",
  },
  invoice_builder: {
    name: "Invoice Builder",
    means: "quotes and invoices without leaving the inbox",
  },
  titan_ai: {
    name: "AI Email Writer",
    means: "repetitive replies stop taking so long to write",
  },
  email_marketing: {
    name: "Campaign Mode",
    means: "telling past customers something, without doing it one message at a time",
  },
  gmail_sync: {
    name: "Add Gmail Account",
    means: "they keep reading their old Gmail in the same place while switching over",
  },
  imap_pop: {
    name: "Third-party mail app (POP/IMAP)",
    means: "they can carry on using the mail app they already know",
  },
  appointment_booking: {
    name: "Appointment Booking",
    means: "people pick a slot themselves instead of messaging back and forth",
  },
  signature_builder: {
    name: "Signature Designer",
    means: "every mail they send looks like it came from a real business",
  },
  site_contact_forms: {
    name: "Contact Forms",
    means: "enquiries arrive in their inbox instead of getting lost in a chat thread",
  },
  site_products: {
    name: "List your products",
    means: "their products on one page they can send someone, with prices",
  },
  site_services: {
    name: "List your services",
    means: "what they do and what it costs, without retyping it into every message",
  },
  site_whatsapp: {
    name: "WhatsApp",
    means: "a chat button on the site itself",
  },
  site_testimonials: {
    name: "Testimonials",
    means: "the word of mouth they already have, where a stranger can read it",
  },
  site_analytics: {
    name: "Visitor analytics",
    means: "they find out whether anyone actually visited, not just that it is live",
  },
  site_branding: {
    name: "Remove Neo Branding",
    means: "the page reads as theirs, with nobody else's name in the footer",
  },
  neo_site: {
    name: "AI-powered site builder",
    means: "a ONE-PAGE site generated from what they described, theirs to edit",
  },
  neo_domain: {
    name: "Free .co.site domain",
    means: "somewhere to publish today, before committing to buying a domain",
  },
  custom_domain: {
    name: "Custom Domain Email",
    means: "customers see their business name, not a generic address",
  },
};

const FEATURE_IDS = Object.keys(FEATURE_SHAPE);

/** Built from the same constant validation enforces, so the two cannot drift. */
const SHAPE_FOR_PROMPT = FEATURE_IDS.map(
  (id) => `  ${id} — "${FEATURE_SHAPE[id].name}" currently means: ${FEATURE_SHAPE[id].means}`,
).join("\n");

interface ModelReason {
  featureId: string;
  because: string;
}

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["reasons"],
  properties: {
    reasons: {
      type: "array",
      minItems: FEATURE_IDS.length,
      maxItems: FEATURE_IDS.length,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["featureId", "because"],
        properties: {
          featureId: { type: "string", enum: FEATURE_IDS },
          because: {
            type: "string",
            description:
              "The clause that would follow 'so that', but WITHOUT the words 'so that'. " +
              "Write 'enquiries land in your inbox', never 'so that enquiries land in your " +
              "inbox'. Lower-case, under 76 characters, no leading dash, no full stop.",
          },
        },
      },
    },
  },
} as const;

const SYSTEM = [
  "You write one short clause per product feature, saying why it matters to ONE specific small",
  "business, from a description of that business.",
  "",
  "You are not choosing features and not naming them. Deterministic code decides which are",
  "shown and prints the product's own name for each. You write only the half-sentence after",
  "the name that says why this particular person would care.",
  "",
  "THE RULE THAT MATTERS MOST: keep the meaning you were given. Each feature below has a",
  "fixed meaning. Say the same thing in terms of THEIR business — never a different thing.",
  "  meaning: 'enquiries arrive in their inbox instead of getting lost in a chat thread'",
  "  florist: 'bouquet enquiries stop getting buried in your Instagram DMs'   GOOD",
  "  florist: 'take card payments straight from the form'                     BAD - new claim",
  "",
  "Never invent a capability, a limit, an integration, a price, or a plan name. If you cannot",
  "make a feature specific to this business, restate its given meaning plainly. A generic line",
  "is fine; an invented one is a lie someone reads before they pay.",
  "",
  "Use what they told you — their trade, their channels, their words. Do not staple the",
  "business noun onto every clause ('for your florist business') and do not use marketing",
  "language. Write like you are explaining it to them across a counter.",
  "",
  "These are the features and their EXACT ids. Use every id exactly once:",
  SHAPE_FOR_PROMPT,
].join("\n");

/**
 * Keep only reasons that are usable, and say what was dropped.
 *
 * Drops, never repairs — same rule as questionService. An unknown id means the model
 * misunderstood the contract, and a reason mapped to the wrong feature would put a claim
 * about one product next to the name of another.
 *
 * The length cap is not cosmetic: the reveal gives this one line, and an overrun wraps into
 * the plan block underneath it.
 */
function validateReasons(raw: ModelReason[] | undefined): {
  reasons: Record<string, string>;
  dropped: string[];
} {
  const reasons: Record<string, string> = {};
  const dropped: string[] = [];

  for (const r of raw ?? []) {
    const id = String(r?.featureId ?? "");
    if (!(id in FEATURE_SHAPE)) {
      dropped.push(`unknown featureId ${id.slice(0, 24)}`);
      continue;
    }
    if (reasons[id]) {
      dropped.push(`duplicate ${id}`);
      continue;
    }
    /* Normalisation, not repair. Stripping a leading "so that" or a stray dash fixes the
       SHAPE of a string whose meaning is unchanged; it is not guessing what the model meant.
       Needed because the reveal renders "Name — {because}" and the hand-written strings carry
       no "so that", so a run where some lines generate and some fall back would otherwise read
       inconsistently. The prompt asks for it too; this is the belt to that pair of braces. */
    const text = String(r?.because ?? "")
      .trim()
      .replace(/^[-–—\s]+/, "")
      .replace(/^so that\s+/i, "")
      .replace(/\.$/, "")
      .trim();
    /* Too short to be a reason; too long to fit the line. Either way the fixed string is
       better than what we were handed. */
    if (text.length < 8 || text.length > 90) {
      dropped.push(`${id}: ${text.length} chars`);
      continue;
    }
    reasons[id] = text;
  }

  return { reasons, dropped };
}

export async function handleReasons(
  businessTextRaw: unknown,
  sid = "none",
): Promise<{ status: number; body: Record<string, unknown> }> {
  const startedAt = Date.now();
  const businessText = String(businessTextRaw ?? "").slice(0, 2000);
  if (businessText.trim().length < 8) {
    return { status: 400, body: { error: "businessText too short" } };
  }

  let raw: ModelReason[] = [];
  let reason = "";
  try {
    const out = await complete<{ reasons: ModelReason[] }>({
      key: "reasons",
      system: SYSTEM,
      user: businessText,
      schema: SCHEMA as unknown as Record<string, unknown>,
      schemaName: "feature_reasons",
      /* 20 short clauses. Generous enough that truncation is a real signal rather than the
         normal case — llm.ts checks finish_reason and says so. */
      maxOutputTokens: 15000,
    });
    raw = out.reasons;
  } catch (err) {
    /* An empty map is a complete answer: every line renders the hand-written string, which is
       exactly what shipped before this route existed. */
    reason = err instanceof Error ? err.message : String(err);
  }

  const { reasons, dropped } = validateReasons(raw);

  console.error(
    "[reasons]",
    JSON.stringify({
      sid,
      ms: Date.now() - startedAt,
      model: process.env.LLM_MODEL ?? "default",
      wrote: Object.keys(reasons).length,
      dropped: dropped.length,
      ...(reason ? { reason: reason.slice(0, 200) } : {}),
      ...(dropped.length ? { droppedDetail: dropped.join(" | ").slice(0, 300) } : {}),
    }),
  );

  return { status: 200, body: { reasons, ...(dropped.length ? { dropped } : {}) } };
}

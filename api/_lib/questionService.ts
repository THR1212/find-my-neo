/**
 * Rewrites the six questions for the business someone typed.
 *
 * SPLIT OUT OF profileService ON PURPOSE — this is a latency fix, not tidying.
 *
 * Both used to come back from one call. That call measured 6s in dev and **37s in
 * production**, which is slower than Neo's 22-38s generator, so the profile stopped being
 * hidden behind it and the guess screen sat on "Working it out..." for half a minute.
 *
 * The guess screen only needs the profile. Question wording is not needed until someone taps
 * "That's us". Generating both in one response made the fast half wait for the slow half for
 * no reason — the questions are ~5x the output tokens of the profile. Now they fire in
 * parallel and the guess appears as soon as the profile lands. Same trick as Neo's site:
 * nothing waits on anything it does not need.
 *
 * Three layers, and only the middle one is generated:
 *   signals + weights   FIXED (weights are data-derived — docs/data-findings.md)
 *   surface text        GENERATED
 *   option ids + resolves  FIXED
 * So no generation can change what an answer means, only how it reads.
 */

import { complete, llmMode } from "./llm.js";
import { proxyToProduction } from "./upstream.js";

/**
 * The fixed question structure, mirrored from src/lib/questions.ts.
 *
 * The model rewrites WORDS against these ids. It never sees or supplies a `resolves` value,
 * a weight, or a signal. Anything it returns that is not an id below is dropped, and a
 * question that loses too much falls back to the fixed bank verbatim.
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
    options: { yes: "Yes, I take orders or payments", enquiry: "No, they enquire, then we arrange it" },
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

interface ModelQuestion {
  questionId: string;
  prompt: string;
  sub: string;
  placeholder: string;
  options: { optionId: string; label: string; hint: string; meter: string }[];
}

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["questions"],
  properties: {
    questions: {
      type: "array",
      minItems: 6,
      maxItems: 6,
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
            description:
              "Placeholder for a free-text box that sits UNDER the options, for someone " +
              "whose answer is not listed. Phrase it as an invitation to type something " +
              "else — 'Somewhere else? Tell us' — never as an instruction to pick an option.",
          },
          options: {
            type: "array",
            minItems: 2,
            maxItems: 4,
            items: {
              type: "object",
              additionalProperties: false,
              required: ["optionId", "label", "hint", "meter"],
              properties: {
                optionId: { type: "string" },
                label: { type: "string", description: "Under 34 characters." },
                hint: {
                  type: "string",
                  description: "Under 46 characters. Empty string if it adds nothing.",
                },
                meter: {
                  type: "string",
                  description:
                    "Subtitle for the narrowing counter AFTER they pick this option. " +
                    "Names similar businesses in their situation. No digits. Under 52 characters. " +
                    "e.g. 'who take cake orders in DMs'.",
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
  "You rewrite six fixed questions for one specific small business, from a short description",
  "of it. You rewrite the question, the clarifying line, the free-text placeholder, and every",
  "option's label and hint.",
  "",
  "Return every questionId and every optionId exactly as given. You are rewriting words,",
  "never structure, and never what an option means.",
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
  "For each option also write meter: 4–10 words for the narrowing counter when they pick",
  "that option. This is the one line that SHOULD name their kind of business plus this",
  "option's situation. Option labels must still not staple the noun; the meter may.",
  "Never a number, never a price, never what this product will do.",
  "  GOOD (bakery + Social DMs): 'bakeries taking orders in DMs'",
  "  GOOD (cinema + Gmail): 'cinemas still running on Gmail'",
  "  GOOD (clinic + start fresh): 'clinics starting their mail fresh'",
  "  GOOD (studio + email and a site): 'studios who want mail and a site'",
  "  BAD:  '1,204 bakeries like you'     - never a count",
  "  BAD:  'we'll set up Instagram checkout' - a product promise",
  "  BAD:  'who sell the way you do'     - too generic; name THEIR trade",
  "",
  "These are the six questions and their EXACT ids. Use these ids verbatim. Do not invent an",
  "id, do not add or drop options, and keep each option meaning what it means now:",
  SHAPE_FOR_PROMPT,
].join("\n");

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

    const options: Record<string, { label?: string; hint?: string; meter?: string }> = {};
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
        meter: String(o.meter ?? "")
          .replace(/\d[\d,]*/g, "")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 64),
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

export async function handleQuestions(
  businessTextRaw: unknown,
  sid = "none",
): Promise<{ status: number; body: Record<string, unknown> }> {
  const startedAt = Date.now();
  const businessText = String(businessTextRaw ?? "").slice(0, 2000);
  if (businessText.trim().length < 8) {
    return { status: 400, body: { error: "businessText too short" } };
  }

  const proxied = await proxyToProduction("/api/questions", businessText, sid);
  if (proxied) return proxied;

  let questions: ModelQuestion[] = [];
  let reason = "";
  try {
    const out = await complete<{ questions: ModelQuestion[] }>({
      key: "questions",
      system: SYSTEM,
      user: businessText,
      schema: SCHEMA as unknown as Record<string, unknown>,
      schemaName: "question_surface",
      maxOutputTokens: 3200,
    });
    questions = out.questions;
  } catch (err) {
    /* Returning an empty surface is a complete answer: every question renders from the
       fixed bank, which is what shipped before this feature existed. */
    reason = err instanceof Error ? err.message : String(err);
  }

  const { surface, dropped } = validateQuestions(questions);

  console.error(
    "[questions]",
    JSON.stringify({
      sid,
      ms: Date.now() - startedAt,
      model: process.env.LLM_MODEL ?? "default",
      mode: llmMode(),
      surfaced: Object.keys(surface).length,
      dropped: dropped.length,
      ...(reason ? { reason: reason.slice(0, 200) } : {}),
      ...(dropped.length ? { droppedDetail: dropped.join(" | ").slice(0, 300) } : {}),
    }),
  );

  return { status: 200, body: { surface, ...(dropped.length ? { dropped } : {}) } };
}

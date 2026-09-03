/**
 * Rewrites the nine questions for the business someone typed.
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

import { complete } from "./llm.js";

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
  /* Added 03 Sep with the questions that make Max and Growth reachable. Leaving them out of
     this mirror does not break anything — validation drops what it does not recognise — it
     just silently costs the generated wording, so three of nine screens would have read from
     the fixed bank forever while the other six were personalised. */
  volume: {
    prompt: "What do you send people?",
    options: {
      text: "Mostly just messages",
      docs: "Photos and documents",
      heavy: "Large files, often",
    },
  },
  extras: {
    prompt: "Which of these did you do last month?",
    options: {
      invoices: "Sent a quote or invoice",
      campaigns: "Message past customers as a group",
      bookings: "Book people in for a time",
      receipts: "Check whether mail was opened",
      none: "None of these",
    },
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
/**
 * Built per request, over only the questions this run will actually ASK.
 *
 * It used to be a module constant covering all nine, because the call fired in parallel with
 * `/api/profile` and so could not know which mattered. A run only ever SHOWS five or six; the
 * rest are prefilled, gated out, or never reached before the reveal.
 *
 * ## THIS DOES NOT MAKE IT FASTER, and I predicted that it would
 *
 * Measured on the same business text, same model, varying only the number of questions asked
 * for:
 *
 *     nine  16s     five  58s     two   9s     nine  18s
 *
 * There is no relationship between payload size and latency worth acting on. The spread
 * inside one size is larger than the difference between sizes, which says the cost is
 * REASONING tokens — the model deliberating before it writes — and that does not scale with
 * how much it is asked to write. Halving the output bought nothing.
 *
 * What it does buy, and the reason it stays: the model rewrites only what someone will read,
 * in the order they will read it, and we stop paying for roughly half an answer nobody sees.
 * Latency has to be solved somewhere else — the 75s ceiling and applying late wording to
 * questions not yet on screen are what actually contain it.
 *
 * An empty list means all of them, so a caller with no ranking to offer keeps the old
 * behaviour.
 */
function shapeForPrompt(ids: string[]): string {
  const wanted = ids.length ? ids.filter((id) => id in QUESTION_SHAPE) : Object.keys(QUESTION_SHAPE);
  return wanted
    .map((qid) => {
      const q = QUESTION_SHAPE[qid];
      const opts = Object.entries(q.options)
        .map(([oid, label]) => `      ${oid} = currently "${label}"`)
        .join("\n");
      return `  questionId "${qid}" — currently "${q.prompt}"\n${opts}`;
    })
    .join("\n");
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
  required: ["questions"],
  properties: {
    questions: {
      type: "array",
      minItems: 9,
      maxItems: 9,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["questionId", "prompt", "sub", "placeholder", "options"],
        properties: {
          questionId: {
            type: "string",
            /* Derived, never typed out. This list was hand-written and went stale twice —
               once stuck at six ids while the bank held nine, and again when `client` was
               removed. QUESTION_SHAPE is the one place a question is declared here. */
            enum: Object.keys(QUESTION_SHAPE),
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
            maxItems: 5,
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

/* Content words, lowercased. Stopwords go because "you need two" vs "two" is not new information. */
const STOP = new Set([
  "a","an","and","are","as","at","by","do","for","from","have","in","is","it","of","on","or",
  "the","to","with","you","your","yours","own","currently","already","usual","usually","often",
  "need","needs","use","uses","using","this","that","these","those","only","just","not","no",
]);
const words = (t: string) =>
  new Set(
    t
      .toLowerCase()
      .replace(/[^a-z0-9 ]+/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 1 && !STOP.has(w)),
  );

/** True when `hint` carries no content word that `context` does not already have. */
function addsNothing(hint: string, context: string): boolean {
  const h = words(hint);
  if (h.size === 0) return true;
  const c = words(context);
  for (const w of h) if (!c.has(w)) return false;
  return true;
}

const SYSTEM = [
  "You rewrite nine fixed questions for one specific small business, from a short description",
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
  "empty hint rather than restating the label. Real hints from an earlier run, all of which",
  "were stripped because they said nothing the screen did not already say:",
  "  'Two'                     -> 'You need two email addresses'   (the question already asks)",
  "  'None of these'           -> 'You do not currently do any of these'",
  "  'Photos and documents'    -> 'You often share images or documents'",
  "But do not swing to giving none at all: that instruction, put more bluntly, returned 27",
  "empty hints out of 27. Write a hint when you can name something CONCRETE out of their own",
  "description — 'Scanned PDFs and other attachments', for a firm that mentioned scanned",
  "returns, is worth having. Return an empty hint when all you would be writing is the label",
  "again in other words.",
  "",
  "These are the questions and their EXACT ids. Use these ids verbatim. Do not invent an",
  "id, do not add or drop options, and keep each option meaning what it means now:",
  "__SHAPE__",
].join("\n");

/** The system prompt for one request. `__SHAPE__` is the only per-run part. */
const systemFor = (ids: string[]) => SYSTEM.replace("__SHAPE__", shapeForPrompt(ids));

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
      const label = String(o.label ?? "").slice(0, 34);
      const hint = String(o.hint ?? "").slice(0, 46);
      options[o.optionId] = {
        label,
        /**
         * A hint that introduces no word the label and prompt do not already carry is padding,
         * and padding on every option is most of why different businesses produced screens that
         * looked the same. The prompt has always asked for this; nothing enforced it, and a
         * real run came back with 'Two' hinted as 'You need two email addresses' under the
         * question "How many email addresses do you need?".
         *
         * Deliberately mechanical and deliberately narrow: it only catches a hint that is
         * strictly redundant, and says nothing about one that merely reads thin. Anything
         * cleverer would be us deciding what is interesting on the model's behalf.
         */
        hint: addsNothing(hint, label + " " + String(q.prompt ?? "")) ? "" : hint,
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
  /**
   * Which questions to rewrite, in the order the flow will ask them.
   *
   * Empty means all of them. The client sends this after the profile call lands, because that
   * is the first moment anything knows which questions this run will actually reach —
   * `questionPriority` minus whatever the description already prefilled.
   */
  wantIdsRaw: unknown = [],
): Promise<{ status: number; body: Record<string, unknown> }> {
  const startedAt = Date.now();
  const businessText = String(businessTextRaw ?? "").slice(0, 2000);
  if (businessText.trim().length < 8) {
    return { status: 400, body: { error: "businessText too short" } };
  }
  /* Validated against our own table, never trusted: an unknown id is dropped rather than
     passed to the model, and an empty result falls back to rewriting everything. */
  const wantIds = (Array.isArray(wantIdsRaw) ? wantIdsRaw : [])
    .map((v) => String(v))
    .filter((id) => id in QUESTION_SHAPE)
    .slice(0, 9);

  let questions: ModelQuestion[] = [];
  let reason = "";
  try {
    const out = await complete<{ questions: ModelQuestion[] }>({
      key: "questions",
      system: systemFor(wantIds),
      user: businessText,
      schema: SCHEMA as unknown as Record<string, unknown>,
      schemaName: "question_surface",
      /* Nine questions now, not six. Raised with the bank; llm.ts reports truncation rather
         than letting it surface as a JSON parse error. */
      /**
       * 8000, and the ceiling is nearly free to raise: billing is on tokens actually used,
       * not on the cap. What it buys is headroom for REASONING tokens, which gpt-5.6 counts
       * against `max_completion_tokens` alongside the visible output. The visible JSON here is
       * only ~1,200-1,500 tokens; at 3,800 a long deliberation left too little room to finish
       * it, and a live call came back "output truncated ... the JSON is incomplete" after 25s.
       *
       * That failure is invisible from outside: the service returns an empty surface, every
       * question renders from the fixed bank, and the flow looks like it simply never
       * personalised anything. Which is the symptom this whole thread began with.
       */
      maxOutputTokens: 8000,
      /* The long call. 45s and no retry beats 20s twice: the old pair spent 40.5s to return
         nothing, and nothing here means every screen reads from the fixed bank. Nobody waits
         on this — it resolves while the guess screen is up and is dropped if a question is
         already being read, so a slow success still costs the user no time. */
      /* Measured live at 11.5s on one call and past 45s on the next — reasoning-token variance,
         not network. 45s was still cutting off successful generations. The wait costs the user
         nothing (the guess screen never blocks on this, and App now applies late wording to
         every question except the one being read), so the ceiling should sit above the slow
         tail rather than inside it. */
      timeoutMs: 75000,
      maxRetries: 0,
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
      surfaced: Object.keys(surface).length,
      dropped: dropped.length,
      ...(reason ? { reason: reason.slice(0, 200) } : {}),
      ...(dropped.length ? { droppedDetail: dropped.join(" | ").slice(0, 300) } : {}),
    }),
  );

  return { status: 200, body: { surface, ...(dropped.length ? { dropped } : {}) } };
}

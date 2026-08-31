/**
 * The question bank.
 *
 * This is the core of the adaptive flow. The old version had a fixed five-screen order,
 * which meant the model ran once and everything after was a form — that is exactly why it
 * did not feel intelligent. Here, every question resolves a named SIGNAL, and the engine
 * asks whichever question resolves the most valuable unknown next.
 *
 * Consequence: two people describing different businesses get different question paths.
 * That is the thing Neo's category picker structurally cannot do, and it is what justifies
 * an LLM being in the loop at all.
 *
 * The model chooses WHICH question to ask. It never invents questions and never writes
 * options — those are fixed here, so the flow can't wander somewhere undemoable and the
 * answers stay continuous with Neo's existing persona data.
 */

export type SignalId =
  | "industry"
  | "teamSize"
  | "importIntent"
  | "currentClient"
  | "surface"
  | "customerChannel"
  | "sellsOnline"
  | "brandName";

export interface QuestionOption {
  id: string;
  label: string;
  hint?: string;
  /** What picking this tells us. Merged into the profile verbatim. */
  resolves: Record<string, string | number | boolean>;
}

export interface Question {
  id: string;
  /** The unknown this question closes. The engine never asks a resolved signal. */
  signal: SignalId;
  prompt: string;
  sub?: string;
  options: QuestionOption[];
  /**
   * Multi-select. True for anything where more than one answer is genuinely true at once —
   * people really do take orders on Instagram AND over the phone, and really do use Gmail
   * AND Outlook. Forcing one answer there produces a tidier dataset and a worse profile.
   *
   * This also matches Neo's own persona survey, where "Why are you signing up?" and "What do
   * you use today?" are both multi-select. Continuity with their data is a pitch asset.
   *
   * Leave false where the options are mutually exclusive (team size, mail-only vs mail+site).
   */
  multi?: boolean;
  /**
   * Free-text box under the options. Neo's survey has "Others (free text)" on its multi-selects
   * and it is where the interesting answers live — 6.6% of their Q1 responses. It is also the
   * only place in the flow after screen 1 where someone can say something we didn't anticipate.
   */
  freeText?: { placeholder: string };
  /**
   * How much this narrows the space, 0-1. Drives the confidence ring and the
   * "possible setups" counter. Ordered by real predictive value where we have it:
   * import intent is the strongest retention signal in the persona data.
   */
  weight: number;
}

export const QUESTIONS: Question[] = [
  {
    id: "import",
    signal: "importIntent",
    prompt: "Bringing anything with you?",
    sub: "If your mail or contacts live somewhere else, we can move them across.",
    weight: 0.3,
    /* Single: "start fresh" and "import emails" cannot both be true. */
    freeText: { placeholder: "Something else you'd want moved across?" },
    options: [
      { id: "none", label: "No, I'll start fresh", resolves: { importIntent: "none" } },
      { id: "emails", label: "Yes, my emails", resolves: { importIntent: "emails" } },
      { id: "both", label: "Emails and contacts", resolves: { importIntent: "both" } },
      { id: "contacts", label: "Just my contacts", resolves: { importIntent: "contacts" } },
    ],
  },
  {
    id: "surface",
    signal: "surface",
    prompt: "What needs standing up first?",
    sub: "You can add the other half later — nothing here is permanent.",
    weight: 0.25,
    /* Single: the two options are the whole space, and "both" is already one of them. */
    options: [
      {
        id: "mail",
        label: "Just email",
        hint: "A professional address on my own domain",
        resolves: { surface: "mail" },
      },
      {
        id: "both",
        label: "Email and a site",
        hint: "Somewhere to send people that isn't a social profile",
        resolves: { surface: "both" },
      },
    ],
  },
  {
    id: "channel",
    signal: "customerChannel",
    prompt: "Where do customers reach you today?",
    sub: "Pick all that apply — most people have more than one.",
    weight: 0.2,
    multi: true,
    freeText: { placeholder: "Somewhere else? WhatsApp, a marketplace, word of mouth…" },
    options: [
      { id: "social", label: "Social DMs", hint: "Instagram, WhatsApp, Facebook", resolves: { customerChannel: "social" } },
      { id: "personal", label: "A personal email address", resolves: { customerChannel: "personal_email" } },
      { id: "phone", label: "Phone or in person", resolves: { customerChannel: "offline" } },
      { id: "site", label: "I already have a website", resolves: { customerChannel: "site" } },
    ],
  },
  {
    id: "client",
    signal: "currentClient",
    prompt: "What do you use for mail right now?",
    sub: "Pick all that apply.",
    weight: 0.2,
    multi: true,
    freeText: { placeholder: "Something else? Zoho, Proton, your host's webmail…" },
    options: [
      { id: "gmail", label: "Gmail", resolves: { currentClient: "gmail" } },
      { id: "outlook", label: "Outlook", resolves: { currentClient: "outlook" } },
      { id: "apple", label: "Apple Mail", resolves: { currentClient: "apple" } },
      { id: "none", label: "Nothing set up yet", resolves: { currentClient: "none" } },
    ],
  },
  {
    id: "team",
    signal: "teamSize",
    prompt: "How many of you are there?",
    sub: "This decides how many mailboxes we set up.",
    weight: 0.15,
    /* Single: a headcount is one number. */
    options: [
      { id: "1", label: "Just me", resolves: { teamSize: 1 } },
      { id: "2", label: "Two of us", resolves: { teamSize: 2 } },
      { id: "3-5", label: "Three to five", resolves: { teamSize: 4 } },
      { id: "6+", label: "More than five", resolves: { teamSize: 8 } },
    ],
  },
  {
    id: "sells",
    signal: "sellsOnline",
    prompt: "Do people pay you online?",
    sub: "Changes what your site needs to do.",
    weight: 0.15,
    freeText: { placeholder: "Anything else about how you get paid?" },
    options: [
      { id: "yes", label: "Yes, I take orders or payments", resolves: { sellsOnline: true } },
      { id: "enquiry", label: "No — they enquire, then we arrange it", resolves: { sellsOnline: false } },
    ],
  },
];

export const QUESTION_BY_ID = new Map(QUESTIONS.map((q) => [q.id, q]));

/** Total narrowing available, used to normalise the confidence ring. */
export const TOTAL_WEIGHT = QUESTIONS.reduce((sum, q) => sum + q.weight, 0);

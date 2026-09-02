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
  /**
   * How many mailboxes they actually need — deliberately NOT headcount.
   *
   * `teamSize` still exists and still means headcount: the model infers it from the free
   * text ("there are three of us") and the guess screen reads it back. But headcount is the
   * wrong number to price on. In Neo's own data 39-64% of mailboxes per domain are generic
   * role addresses — info@, sales@, support@ — so a one-person business routinely wants
   * three mailboxes. Pricing that person for one both under-charges and pushes them to Lite,
   * which caps them wrong. See docs/data-findings.md §7.
   */
  | "mailboxCount"
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
   * "possible setups" counter, and — because `nextQuestion` picks the heaviest unresolved
   * question — decides what gets asked first when the model has no preference.
   *
   * Weighted by **how much the answer moves the recommendation**, which is not the same as
   * how interesting it is. `mailboxCount` is a straight multiplier on price and gates
   * Lite/Starter/Standard, so it is heaviest. `surface` gates the whole site plan and the
   * billing cycle. `sellsOnline` picks the site tier. The remaining three only colour the
   * feature bullets.
   *
   * This used to lead on import intent, on the grounds that it was "the strongest retention
   * signal in the persona data". That reading does not survive checking: "No, don't want to
   * import" retains at 79.5% against 82.4% for "yes, both" — an 8.6pt spread — while merely
   * *answering* the field is 79.3% vs 29.5% blank. `import_emails_contacts` sits late in
   * Neo's onboarding, so its retention measures how far someone got, not what they wanted,
   * and it is not knowable at all when we ask it: before purchase, of a cold visitor.
   * See docs/data-findings.md §1c. Import intent still gates Lite vs Starter, so it keeps
   * real weight — just not the most.
   *
   * The totals still sum to 1.25, so the narrowing meter's pacing is unchanged; only the
   * order in which questions surface has moved.
   */
  weight: number;
}

export const QUESTIONS: Question[] = [
  {
    id: "import",
    signal: "importIntent",
    prompt: "Bringing anything with you?",
    sub: "If your mail or contacts live somewhere else, we can move them across.",
    /* Was 0.3 and asked first, on a retention claim that turned out to be a selection
       effect — see the weight doc above. Still gates Lite vs Starter, so it earns 0.15. */
    weight: 0.15,
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
    /* Was 0.2. `current_email_app` is filled on the same 2,484 orders as the import field
       and carries the same selection effect, and it feeds no plan or price decision — only
       two feature bullets. Asked late now, if at all. */
    weight: 0.15,
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
    signal: "mailboxCount",
    /* Asks for addresses, not headcount. Neo's data says these diverge for most of their
       customers — see the mailboxCount note on SignalId. Asking "how many of you are there?"
       got us a headcount we then priced as a mailbox count, which is wrong in the common
       case and wrong in the direction that annoys people: too few. */
    prompt: "How many email addresses do you need?",
    sub: "Addresses, not people — plenty of one-person businesses run info@ and sales@ too.",
    weight: 0.3,
    /* Single: a count is one number. */
    options: [
      { id: "1", label: "Just one", hint: "Only me, only my name", resolves: { mailboxCount: 1 } },
      { id: "2", label: "Two", hint: "Say mine plus a hello@", resolves: { mailboxCount: 2 } },
      {
        id: "3-5",
        label: "Three to five",
        hint: "Mine plus info@, sales@, bookings@…",
        resolves: { mailboxCount: 4 },
      },
      { id: "6+", label: "More than five", resolves: { mailboxCount: 8 } },
    ],
  },
  {
    id: "sells",
    signal: "sellsOnline",
    prompt: "Do people pay you online?",
    sub: "Changes what your site needs to do.",
    /* 0.15 -> 0.2: this picks the site tier (Basic vs Plus), so it moves the price. */
    weight: 0.2,
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

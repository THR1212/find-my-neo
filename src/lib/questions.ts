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
  /**
   * The six below exist to make Max and Growth reachable, and each one gates on a real
   * entitlement rather than a preference. Added 03 Sep — before them, `chooseMailPlan` could
   * only ever return Starter or Standard, so two of Neo's plans were listed in plans.json and
   * unreachable by any code path.
   *
   * Ordering note: these are asked only when they DISCRIMINATE (see candidates.ts), so adding
   * six questions does not add six questions to anyone's flow. A business none of them applies
   * to will never see them.
   */
  | "attachmentVolume"
  /** Multi-select. Holds any of invoices / campaigns / bookings / receipts / none. */
  | "extras"
  | "catalogueSize"
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
  /* THERE IS NO `client` QUESTION, and it was measured out rather than argued out.
   *
   * "What do you use for mail right now?" had four options and ONE plan outcome, which was
   * already known. What settled it: across all 16 import x client combinations the reveal
   * produced two distinct bullet pairs, and BOTH differences came from `import`. Changing the
   * client answer changed nothing anyone saw or paid — `gmail_sync` and `imap_pop` are ranked
   * below `multi_device_support` and never reach the one mail slot the reveal has.
   *
   * So it cost a screen and bought nothing. `currentClient` survives as a signal because the
   * description often states it outright ("we still run everything off one shared Gmail") and
   * profileService can prefill it for free — which is the right way to learn something that
   * does not justify asking.
   */
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

/**
 * Model-written surface text for one question.
 *
 * WHAT THE MODEL MAY CHANGE: the words. Prompt, sub-line, option labels, option hints, the
 * free-text placeholder. Nothing else.
 *
 * WHAT IT MAY NOT: the option set, the option ids, the `resolves` payloads, the signal, the
 * weight, or whether the question is multi-select. Those are the contract `rules.ts` and
 * `features.ts` are built on, and a model that could edit them could change a price.
 *
 * THE RULE FOR LABELS, which is not obvious and matters more than the rest: an option
 * describes the USER'S situation, never what this product does. "Instagram, WhatsApp and
 * Twitter" is a fact about them. "Sell tickets on your site" is a promise about us — and one
 * Neo may not keep. Feature claims live in `features.ts` with Neo's own verbatim names, and
 * a generated option label must never imply a capability. See docs/neo-product-facts.md.
 */
export interface QuestionSurface {
  prompt?: string;
  sub?: string;
  placeholder?: string;
  /** Keyed by the EXISTING option id. Unknown ids are dropped server-side. */
  options?: Record<string, { label?: string; hint?: string }>;
}

/** Surface overrides by question id, as validated by the server. */
export type SurfaceMap = Record<string, QuestionSurface>;

/**
 * Overlay model-written wording onto a fixed question.
 *
 * Returns the question unchanged when there is no override, so every caller can treat the
 * generated and fixed paths identically — and a failed generation degrades to exactly what
 * ships today rather than to a broken screen.
 */
export function withSurface(q: Question, surface?: SurfaceMap): Question {
  const s = surface?.[q.id];
  if (!s) return q;

  return {
    ...q,
    prompt: s.prompt?.trim() || q.prompt,
    sub: s.sub?.trim() || q.sub,
    freeText: q.freeText
      ? { placeholder: s.placeholder?.trim() || q.freeText.placeholder }
      : q.freeText,
    options: q.options.map((o) => {
      const ov = s.options?.[o.id];
      if (!ov) return o;
      return {
        ...o,
        label: ov.label?.trim() || o.label,
        hint: ov.hint?.trim() || o.hint,
        /* resolves is deliberately NOT spread from the override. It is the whole point. */
      };
    }),
  };
}

/* --- The six that reach Max and Growth ---------------------------------------------------
 *
 * WHY THESE SIX AND NOT ANY OTHERS. docs/data-findings.md §5 is the most directly useful thing
 * we have for a pre-purchase quiz: it records which paywall someone actually clicked before
 * paying. `Storage Banner` dominates in EVERY industry at 32-52% of conversions, `Read Receipt`
 * is the #2 real feature at 8-12%, and everything else is low single digits. So storage leads,
 * receipts follow, and the rest are here because they are hard entitlement gates in Pandora —
 * not because they sound compelling.
 *
 * EVERY OPTION DESCRIBES WHAT THEY DO TODAY, never what they would like. "Do you send quotes
 * or invoices?" is a fact; "would you like to send invoices?" is a feature pitch, and people
 * say yes to nice-sounding features they never use — §9 measured exactly that, with only 3.5%
 * of orders ever building an order form. Behaviour is the honest thing to price on.
 *
 * WEIGHTS ARE PROVISIONAL and say so. §5 justifies storage above receipts above the rest; the
 * exact numbers below are not data-derived the way the original six are. This matters much
 * less than it used to, because `nextQuestion` now selects on discrimination and weight only
 * breaks ties — and runs.jsonl is how we settle them rather than by feel.
 */
QUESTIONS.push(
  {
    id: "volume",
    signal: "attachmentVolume",
    prompt: "What do you send people?",
    sub: "Storage is the single most common reason people upgrade — worth getting right.",
    weight: 0.25,
    freeText: { placeholder: "Something bulkier? Tell us" },
    options: [
      { id: "text", label: "Mostly just messages", resolves: { attachmentVolume: "text" } },
      {
        id: "docs",
        label: "Photos and documents",
        hint: "Quotes, invoices, a few images",
        resolves: { attachmentVolume: "docs" },
      },
      {
        id: "heavy",
        label: "Large files, often",
        hint: "Design files, video, big galleries",
        resolves: { attachmentVolume: "heavy" },
      },
    ],
  },
  {
    /**
     * FOUR Max gates in ONE multi-select, and the reason is drop-off asymmetry.
     *
     * These were four separate yes/no questions and the probe showed why that fails: a "yes"
     * settles the plan and kills all further discrimination, while a "no" leaves every tier
     * open. So a plain business answering no to everything was asked SEVEN questions, and a
     * consultant who invoices was asked THREE — the longest flow going to exactly the people
     * most likely to abandon. Four consecutive "do you do X" screens also read as a feature
     * checklist, which is the form feeling the adaptive flow exists to avoid.
     *
     * As one checklist, a plain business clears all four in a single tap on "None of these".
     *
     * Every option is a Max entitlement in Pandora: Invoice Builder, Campaign Mode and
     * Appointment Booking are explicitly absent below Max, and only Max has unlimited read
     * receipts (Starter caps at 50, Standard is a 90-day trial). Read receipts earn their
     * place from data — docs/data-findings.md §5 has them as the #2 paywall trigger at 8-12%,
     * behind only storage.
     */
    id: "extras",
    signal: "extras",
    /**
     * "REGULAR PART OF YOUR WORK", NOT "DO YOU DO THIS TODAY".
     *
     * Run hmcrd0yw is the argument. Someone whose own description said "no website or mailbox"
     * was asked what they do *today* — they cannot be doing any of it today, so the options
     * read as a menu and they ticked two. One tick is Rs418 -> Rs868. Every answer that
     * question could get from them was aspirational.
     *
     * "Today" was also wrong for a subtler set of people: someone who emails two invoices a
     * year truthfully answers yes, and gets charged for Invoice Builder they will open twice.
     * The entitlement is worth its price to someone who quotes jobs weekly and is not worth it
     * to someone who quotes twice. Regularity is what separates them, and it is a fair thing
     * to ask — unlike wanting, which everybody does.
     *
     * The options are unchanged in MEANING, which is what `resolves` and the rewrite contract
     * both depend on. What changed is that they now describe the work rather than the mail
     * feature: someone who quotes jobs recognises themselves whether or not they email a PDF.
     */
    prompt: "Which of these are a regular part of your work?",
    sub: "Only what you actually do often. Leave the rest — you can add it any time.",
    weight: 0.2,
    multi: true,
    freeText: { placeholder: "Something else you do a lot of?" },
    options: [
      {
        id: "invoices",
        label: "Quoting and invoicing jobs",
        hint: "Regularly, not once a year",
        resolves: { extras: "invoices" },
      },
      {
        id: "campaigns",
        label: "Message past customers as a group",
        hint: "Offers, new stock, seasonal notes",
        resolves: { extras: "campaigns" },
      },
      { id: "bookings", label: "Book people in for a time", resolves: { extras: "bookings" } },
      {
        id: "receipts",
        label: "Check whether mail was opened",
        resolves: { extras: "receipts" },
      },
      { id: "none", label: "None of these", resolves: { extras: "none" } },
    ],
  },
  {
    id: "catalogue",
    signal: "catalogueSize",
    prompt: "How much would you list on the site?",
    sub: "Products or services, roughly.",
    weight: 0.12,
    options: [
      { id: "few", label: "A handful", hint: "Under ten", resolves: { catalogueSize: "few" } },
      { id: "dozens", label: "Dozens", resolves: { catalogueSize: "dozens" } },
      { id: "hundreds", label: "Hundreds", resolves: { catalogueSize: "hundreds" } },
    ],
  },
);

export const QUESTION_BY_ID = new Map(QUESTIONS.map((q) => [q.id, q]));

/** Total narrowing available, used to normalise the confidence ring. */
export const TOTAL_WEIGHT = QUESTIONS.reduce((sum, q) => sum + q.weight, 0);

/**
 * Plain-English lines for the questions the free text already answered.
 *
 * Reads the profile back through the SAME option table the question would have shown, so the
 * words a person sees on the guess screen are the words they would have tapped. Nothing here
 * is model-written: if the description said "orders come through Instagram DMs", this renders
 * the fixed label "Social DMs", which is the option `prefill` actually resolved to.
 *
 * Deliberately shows the resolved OPTION, not the raw sentence. The point of the line is to
 * expose what we recorded — the thing that will price them — rather than to flatter them by
 * repeating their own text back.
 *
 * Returns [] when nothing was prefilled, which is the common case and renders nothing.
 */
export function describePrefill(
  profile: Record<string, unknown>,
  prefilledIds: string[] | undefined,
  surface?: SurfaceMap,
): string[] {
  const lines: string[] = [];
  for (const id of prefilledIds ?? []) {
    const q = QUESTION_BY_ID.get(id);
    if (!q) continue;
    const shown = withSurface(q, surface);
    const value = profile[q.signal];
    const matched = shown.options.filter((o) => {
      const v = o.resolves[q.signal];
      if (v === undefined) return false;
      return Array.isArray(value) ? value.includes(String(v)) : value === v;
    });
    if (!matched.length) continue;
    /* Trailing "?" off the prompt: it is a statement here, not a question. */
    const label = shown.prompt.replace(/\?+\s*$/, "");
    lines.push(`${label}: ${matched.map((o) => o.label).join(", ")}`);
  }
  return lines;
}

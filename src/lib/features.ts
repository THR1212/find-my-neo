/**
 * Feature highlighting.
 *
 * Once we've recommended a plan, we say WHY — one or two real Neo features this particular
 * person will actually use, tied to something they told us. "Read receipts" means nothing in
 * the abstract; "so you know whether the quote was opened" lands, because they just told us
 * they send quotes.
 *
 * ┌──────────────────────────────────────────────────────────────────────────────────┐
 * │ THE MODEL DOES NOT CHOOSE THESE, AND MUST NEVER WRITE THEM.                       │
 * │ Matching is deterministic — see pickFeatures(). A hallucinated Neo feature in     │
 * │ front of the Neo product team is the worst failure this demo could have.          │
 * │                                                                                   │
 * │ NAMES ARE NEO'S OWN, VERBATIM, from their plan feature catalogue:                 │
 * │   https://static.flock.co/meta/plan/feature/config/en-US.json                     │
 * │ (public, no auth; captured from the live checkout flow 28 Aug 2026 — 49 features) │
 * │                                                                                   │
 * │ The `id` on each entry is Neo's own key in that file. BEFORE ADDING A FEATURE:    │
 * │ find its key there and copy the `heading` exactly. Do not invent a snappier name  │
 * │ — the point is that a Neo PM can look it up.                                      │
 * └──────────────────────────────────────────────────────────────────────────────────┘
 *
 * Corrections this catalogue forced on an earlier hand-written version — the reason
 * "check the source" is a rule here and not a suggestion:
 *   "AI Smart Write"   -> actually **AI Email Writer**   (`titan_ai`)
 *   "Email Campaigns"  -> actually **Campaign Mode**     (`email_marketing`)
 *   "Email tracking"   -> actually **Read Receipts**     (`read_receipts`)
 *   "Mail and contact import" -> **One-click import of existing emails & contacts**
 *
 * Also settled by the catalogue:
 *   `neo_domain`   = "maxdesigns.co.site domain"  -> the FREE .co.site subdomain
 *   `custom_domain`= "Custom Domain Email"        -> a domain you ALREADY OWN (bring your own)
 *   `neo_site`     = "AI-powered site builder"    -> one-page (asset is one_page_site.png)
 */

import { has, type Profile } from "./profile";
import { QUESTIONS } from "./questions";

export type FeatureSurface = "mail" | "site";

export interface Feature {
  /** Neo's own key in their feature catalogue. Traceable on purpose. */
  id: string;
  /** Neo's own `heading`, verbatim. Do not reword. */
  name: string;
  surface: FeatureSurface;
  /**
   * Why THIS person cares. Ours to write — it is the personalisation, and the only part of
   * the line that isn't Neo's copy. Keep it concrete and tied to a signal they gave us;
   * generic benefit copy is exactly what we're trying to beat.
   */
  because: string;
  /**
   * Lowest site plan that actually includes this, per `src/data/site-features.json`.
   *
   * Absent means every tier has it (or it is a mail feature, where our plans do not gate the
   * ones we surface). This exists because relevance and availability are different questions,
   * and answering only the first produced a real contradiction: a phone-and-walk-ins bike shop
   * matched `Contact Forms` on relevance, was correctly recommended **Basic** on price — and
   * Basic has no contact forms. We would have printed a feature the plan underneath it does
   * not include, which is the exact "promise we cannot keep" failure the verbatim-names rule
   * exists to prevent.
   */
  minSitePlan?: "basic" | "plus" | "growth";
  /**
   * Lowest MAIL plan that actually grants this, per `src/data/plan-features.json` (Pandora
   * backend, and the highest authority we have — it beats both the name config and the
   * marketing table).
   *
   * The mail half had the same fault as the site half, and worse. Four features here are
   * **Max-only**, and `chooseMailPlan` can only return Starter or Standard — so Invoice
   * Builder, AI Email Writer, Campaign Mode and Appointment Booking were being offered as
   * reasons to buy a plan that does not include any of them. Pandora is explicit that Invoice
   * Builder is *disabled* on Starter and Standard.
   */
  minMailPlan?: "starter" | "standard" | "max";
  /** True when this person's profile makes the feature genuinely relevant. */
  matches: (p: Profile) => boolean;
  /** Tie-break when several match. Higher wins. */
  priority: number;
}

/* Delegates to engine.has() because a profile value may be an ARRAY once the question is
   multi-select. A direct `p[k] === v` silently stops matching and nothing tells you. */
const is = (p: Profile, k: string, v: unknown) => has(p, k, v);

export const FEATURES: Feature[] = [
  {
    id: "import_email_contacts",
    name: "One-click import of existing emails & contacts",
    surface: "mail",
    because: "your existing mail comes across, so nothing is lost in the move",
    matches: (p) => p.importIntent !== undefined && !is(p, "importIntent", "none"),
    priority: 10,
  },
  {
    id: "multi_device_support",
    name: "Multi-account Support",
    surface: "mail",
    /* Neo's own description literally cites sales@ and info@ — exactly the shape of the
       hello@/orders@ split we put on the reveal. */
    because: "so orders@ and hello@ can live apart instead of in one personal inbox",
    /* Either count qualifies: two mailboxes is the trigger whether that's two people or
       one person running hello@ alongside their own name. mailboxCount is what the question
       now asks; teamSize is the model's headcount read and only stands in without it. */
    matches: (p) =>
      is(p, "customerChannel", "social") || Number(p.mailboxCount ?? p.teamSize ?? 0) >= 2,
    priority: 9,
  },
  {
    /**
     * Four features added 03 Sep so a reveal has something SPECIFIC to say.
     *
     * The bank had grown around what differentiates tiers, so a Starter or Standard reveal
     * fell back on floors — "Android and iOS apps", "Custom Domain Email" — while Neo's own
     * table lists twenty-one things Starter includes and fifteen more Standard adds.
     *
     * The constraint on which ones could be added is not the table, it is our SIGNALS: we ask
     * seven questions, so a feature earns a place only if one of those answers already implies
     * it. Anything else would have to match always-true, and a second floor is not an
     * improvement. These four each key off an answer we already hold.
     *
     * Tier claims cross-checked against both sources: page and Pandora agree Email Rules and
     * Shareable Calendar are on every plan. For Turbo Search and Priority Inbox the pricing
     * page is the only evidence (Starter no, Standard yes) — Pandora neither gates them nor
     * lists them as every-plan, which is consistent, so `minMailPlan: "standard"` is the safe
     * reading. If that is ever contradicted, they simply stop showing on Starter.
     */
    id: "email_rule",
    name: "Email Rules",
    surface: "mail",
    because: "mail sorts itself into the right address instead of piling into one inbox",
    /* Only meaningful once there is more than one address to sort INTO. */
    matches: (p) => Number(p.mailboxCount ?? 0) >= 2,
    priority: 5,
  },
  {
    id: "shareable_calendar",
    name: "Shareable Calendar",
    surface: "mail",
    because: "the others can see what you have on without asking",
    /* Headcount, not mailbox count: sharing needs a second PERSON, and §7 is the reason those
       are different questions — 39-64% of Neo mailboxes are role addresses, not people. */
    matches: (p) => Number(p.teamSize ?? 0) >= 2,
    priority: 5,
  },
  {
    id: "turbo_search",
    minMailPlan: "standard",
    name: "Turbo Search",
    surface: "mail",
    because: "you are bringing years of mail across, and you will want to find things in it",
    matches: (p) => is(p, "importIntent", "emails") || is(p, "importIntent", "both"),
    priority: 6,
  },
  {
    id: "priority_inbox",
    minMailPlan: "standard",
    name: "Priority Inbox",
    surface: "mail",
    because: "the messages that need you first, in a shared inbox several people watch",
    /* Three or more addresses is where a shared inbox stops being skimmable. */
    matches: (p) => Number(p.mailboxCount ?? 0) >= 3,
    priority: 6,
  },
  {
    /**
     * THE SECOND FLOOR, and there are deliberately exactly two.
     *
     * Hari's rule, 04 Sep: a reveal must never show fewer than two features, and the mail-only
     * pane must never show fewer than two panes. One floor got the left column to two; the
     * RIGHT column needs two things with MEDIA, and `custom_domain` — the usual second bullet
     * on a sparse Starter — has no artwork in Neo's set, so it is dropped from the pane and a
     * lone film stretched across it.
     *
     * Rich webmail is on all three plans and true of everyone who buys anything, so like
     * `mobile_apps` it can never be wrong. Ranked BELOW it, so between the two floors the more
     * interesting one leads. Two is the cap: a third always-true feature would start crowding
     * out the specific ones, which is the padding the commonness ranking exists to prevent.
     */
    id: "rich_webmail",
    name: "Rich webmail",
    surface: "mail",
    because: "a proper inbox in the browser, with nothing to install",
    matches: () => true,
    priority: 1,
  },
  {
    /**
     * THE FLOOR. Always true, lowest priority, and that combination is the point.
     *
     * A plain mail-only Starter run — mostly messages, phone customers, one address, nothing
     * done last month — matched exactly ONE feature and the reveal showed a single bullet.
     * Not because we had nothing true to say: Neo's own comparison table (src/data/
     * mail-features.json, read from their pricing page) lists eighteen things Starter
     * includes. We just modelled almost none of them, because the bank grew around what
     * DIFFERENTIATES tiers rather than what a plan contains.
     *
     * "Android and iOS apps" is Neo's verbatim row, it is on all three plans, and it is true
     * of everyone — so it can never be wrong, and the commonness ranking added this morning
     * keeps it out of the way of anything more specific. It surfaces only when there is
     * genuinely nothing more particular to say, which is exactly when a reveal needs a floor.
     */
    id: "mobile_apps",
    name: "Android and iOS apps",
    surface: "mail",
    because: "the same inbox on your phone and your laptop, without forwarding anything",
    matches: () => true,
    /* Below every other mail feature. It is a backstop, not a selling point. */
    priority: 2,
  },
  {
    /**
     * THE #1 CONVERSION DRIVER, and it had no bullet at all until 03 Sep.
     *
     * docs/data-findings.md §5 measures real paywall clicks: `Storage Banner` is the dominant
     * trigger in EVERY industry at 32-52%, ahead of everything else by a distance. `volume` is
     * already the question that most often sets the mail tier because of it — and yet someone
     * who answered "Large files, often", was moved to Max for that reason, and read a needs
     * line saying "you send large files often" was never told what they actually got.
     *
     * No `minMailPlan`: every tier has storage. What differs is the amount — 15 / 50 / 100 GB,
     * from Neo's own pricing table, recorded in plan-features.json rather than typed here.
     * The `because` states the PER-MAILBOX fact instead of a number, because that is the part
     * people get wrong and the part that survives a price change.
     */
    id: "storage",
    name: "Mailbox Storage",
    surface: "mail",
    because: "room for what you send, counted per mailbox rather than shared across the team",
    matches: (p) => is(p, "attachmentVolume", "docs") || is(p, "attachmentVolume", "heavy"),
    /* Above multi_device_support (9) and below import (10): it is the strongest reason in the
       data, but only for the people who told us they send things, which `matches` enforces. */
    priority: 9.5,
  },
  {
    /**
     * NO `minMailPlan`, deliberately: Pandora has read receipts on all three tiers, capped at
     * 50/month on Starter and a 90-day trial on Standard, unlimited on Max. Only the unlimited
     * version is a Max thing.
     *
     * That is why `know_it_was_read` is no longer a need in candidates.ts — and why this line
     * now matches the explicit tick as well. Someone who tells us they track opens used to be
     * charged for Max and, on the tiers below, could still miss the bullet entirely; now they
     * keep their tier and are told the feature is there.
     */
    id: "read_receipts",
    name: "Read Receipts",
    surface: "mail",
    because: "you can tell whether a quote was actually opened",
    /* `sellsOnline === false` was here and has gone: "does not sell online" is a strange
       reason to want read receipts, and it was the loosest matcher in the bank — it fired for
       most people and pushed this to the top of nearly every Starter reveal. What is left is
       the two signals that actually mean it: they said they check whether mail was opened,
       or they are moving off a personal address where they never could. */
    matches: (p) => is(p, "extras", "receipts") || is(p, "customerChannel", "personal_email"),
    priority: 8,
  },
  {
    id: "invoice_builder",
    minMailPlan: "max",
    name: "Invoice Builder",
    surface: "mail",
    because: "quotes and invoices without leaving your inbox",
    matches: (p) => is(p, "sellsOnline", true),
    priority: 8,
  },
  {
    id: "titan_ai",
    minMailPlan: "max",
    name: "AI Email Writer",
    surface: "mail",
    because: "replies to the same three questions stop eating your evenings",
    matches: (p) =>
      is(p, "customerChannel", "social") || is(p, "customerChannel", "personal_email"),
    priority: 6,
  },
  {
    id: "email_marketing",
    minMailPlan: "max",
    name: "Campaign Mode",
    surface: "mail",
    because: "tell past customers what's new without doing it one message at a time",
    matches: (p) => is(p, "sellsOnline", true),
    priority: 6,
  },
  {
    id: "gmail_sync",
    name: "Add Gmail Account",
    surface: "mail",
    because: "keep reading your old Gmail in the same place while you switch over",
    matches: (p) => is(p, "currentClient", "gmail"),
    priority: 7,
  },
  {
    id: "imap_pop",
    name: "Third-party mail app (POP/IMAP)",
    surface: "mail",
    because: "carry on using Outlook if you'd rather not change habits",
    matches: (p) => is(p, "currentClient", "outlook") || is(p, "currentClient", "apple"),
    priority: 7,
  },
  {
    id: "appointment_booking",
    name: "Appointment Booking",
    /* MAIL, and Max only. We had this filed as a `site` feature, which it is not — it appears
       in no site plan at all. Since chooseMailPlan cannot return Max it will never surface
       today; that is correct behaviour, not dead code, and it is recorded in
       plan-features.json as an open question about whether Max should be reachable. */
    surface: "mail",
    minMailPlan: "max",
    because: "people pick a slot themselves instead of messaging back and forth",
    matches: (p) => is(p, "sellsOnline", false) || is(p, "customerChannel", "offline"),
    priority: 5,
  },
  {
    id: "signature_builder",
    /* MAX, not standard. Confirmed by Hari 03 Sep; plan-features.json still says "STANDARD and
       MAX" and is stale on this one. At standard it was offered as a reason to buy a plan that
       does not include it — the exact failure minMailPlan exists to prevent. */
    minMailPlan: "max",
    name: "Signature Designer",
    surface: "mail",
    because: "every mail you send looks like it came from a real business",
    matches: (p) => is(p, "customerChannel", "personal_email"),
    priority: 4,
  },

  /* --- Site ---
   *
   * SOURCE IS DIFFERENT FROM THE MAIL HALF ABOVE, and that matters when you add one.
   *
   * Mail features come from Neo's JSON config (the 49-entry file named at the top of this
   * file), so their names are the API's own `heading` verbatim. **There is no equivalent
   * config for site features** — three plausible paths were probed and all 403'd, and the
   * pricing page fetches no second config. Neo's site features exist only as static markup in
   * their pricing page's "AI Site Pricing" comparison table.
   *
   * That table is captured in `src/data/site-features.json` with its read date. Names below
   * are its verbatim `feature-name` cells. Before adding one, check it there — and re-read the
   * live page if you are about to quote a limit to anyone at Neo, because a marketing page
   * changes without warning.
   *
   * There used to be three entries here and two of them were `matches: () => true`, so every
   * site recommendation on earth showed the same bullets. That is the "the reveal is
   * templated" complaint in its purest form: personalised copy sitting on top of a feature
   * set that never varied.
   */
  {
    id: "site_contact_forms",
    minSitePlan: "plus",
    name: "Contact Forms",
    surface: "site",
    /* THE most important row in Neo's site table: Basic has none at all (Plus 1000, Growth
       unlimited). See rules.ts — this is why an enquiry-led business cannot be sent to Basic. */
    because: "enquiries land in your inbox instead of a DM you'll scroll past",
    matches: (p) =>
      is(p, "sellsOnline", false) ||
      is(p, "customerChannel", "social") ||
      is(p, "customerChannel", "personal_email"),
    priority: 10,
  },
  {
    id: "site_products",
    name: "List your products",
    surface: "site",
    because: "your products on a page you can send someone, priced and in one place",
    matches: (p) => is(p, "sellsOnline", true),
    priority: 9,
  },
  {
    id: "site_services",
    name: "List your services",
    surface: "site",
    because: "what you do and what it costs, without retyping it into every message",
    matches: (p) => is(p, "sellsOnline", false) && !is(p, "customerChannel", "offline"),
    priority: 8,
  },
  {
    id: "site_whatsapp",
    minSitePlan: "plus",
    name: "WhatsApp",
    surface: "site",
    /* Plus and above. Neo's own generated sites carry a WhatsApp widget — observed in a real
       run, see docs/neo-product-facts.md — so this is a fact about the product, not a claim. */
    because: "the chat button your customers already expect, on the site itself",
    matches: (p) => is(p, "customerChannel", "social"),
    priority: 7,
  },
  {
    id: "site_testimonials",
    minSitePlan: "plus",
    name: "Testimonials",
    surface: "site",
    because: "the word-of-mouth you already have, where a stranger can read it",
    matches: (p) => is(p, "customerChannel", "offline") || is(p, "customerChannel", "personal_email"),
    priority: 6,
  },
  {
    id: "site_analytics",
    name: "Visitor analytics",
    surface: "site",
    /* On every site plan including Basic — safe to show to anyone with a site. */
    because: "you find out whether anyone actually came, not just that it's live",
    matches: (p) => is(p, "customerChannel", "site"),
    priority: 5,
  },
  {
    id: "site_branding",
    minSitePlan: "plus",
    name: "Remove Neo Branding",
    surface: "site",
    /* Absent on Basic. Only worth surfacing to someone already heading for Plus. */
    because: "the page reads as yours, with nobody else's name in the footer",
    matches: (p) => is(p, "sellsOnline", true) || is(p, "customerChannel", "site"),
    priority: 4,
  },
  {
    id: "neo_site",
    name: "AI-powered site builder",
    surface: "site",
    /* One page — Neo's own asset for this feature is one_page_site.png, and the builder's
       system prompt says "one-page landing website". Never imply multi-page. */
    because: "a one-page site generated from what you just told us, yours to edit",
    matches: (p) => is(p, "customerChannel", "social") || is(p, "surface", "both"),
    priority: 3,
  },
  {
    id: "neo_domain",
    name: "Free .co.site domain",
    surface: "site",
    /* Catalogue heading is templated ("maxdesigns.co.site domain"), so this one is
       necessarily paraphrased — but the SUBSTANCE is exact: neo_domain is the free
       .co.site subdomain, confirmed by walking the funnel.
       Last-resort fallback: matches everyone, so it must stay the lowest site priority. */
    because: "somewhere to publish today, before you commit to buying a domain",
    matches: () => true,
    priority: 1,
  },
  {
    id: "custom_domain",
    name: "Custom Domain Email",
    surface: "mail",
    because: "customers see your business name, not a generic address",
    matches: () => true,
    priority: 1,
  },
];

/**
 * Pick up to `limit` features for the surfaces in play. At most one per surface when both are
 * in play, so a mail+site recommendation justifies each half rather than stacking two reasons
 * for whichever matched hardest — the point is to explain the shape of the recommendation.
 */
const SITE_TIER_RANK: Record<string, number> = { basic: 0, plus: 1, growth: 2 };
const MAIL_TIER_RANK: Record<string, number> = { starter: 0, standard: 1, max: 2 };

/**
 * Is this feature actually included in the plan being recommended?
 *
 * `sitePlanId` is what `rules.ts` chose. Passing null (mail-only, or no plan yet) keeps every
 * feature eligible, because there is no site tier to contradict.
 */
function availableOn(f: Feature, sitePlanId: string | null, mailPlanId: string | null): boolean {
  if (f.minSitePlan) {
    if (!sitePlanId) return false;
    if ((SITE_TIER_RANK[sitePlanId] ?? 0) < SITE_TIER_RANK[f.minSitePlan]) return false;
  }
  if (f.minMailPlan) {
    if (!mailPlanId) return false;
    if ((MAIL_TIER_RANK[mailPlanId] ?? 0) < MAIL_TIER_RANK[f.minMailPlan]) return false;
  }
  return true;
}

/**
 * How often each feature matches, across the profiles our own questions can produce.
 *
 * THE PROBLEM THIS SOLVES. The reveal shows one feature per surface, chosen by `priority` —
 * and priority turned out to track how GENERIC a feature is. `import_email_contacts` is
 * priority 10 and matches 100% of profiles; `site_contact_forms` is 10 and matches 75%.
 * So the top of each surface was occupied by whatever applies to everyone, and a measured
 * sweep of 96 profiles produced 12 distinct bullet pairs, with 11 of the 20 features unable
 * to appear under ANY combination.
 *
 * A bullet that is true of nearly every business is not telling this one anything. So a
 * feature's rank is now its priority minus how common it is: priority still says what matters
 * more, commonness says how much of that is news.
 *
 * The reference set is built FROM `QUESTIONS`, not hand-written, so it cannot describe a
 * world the flow no longer produces — the `client` question's removal changes these rates
 * without anyone remembering to update a fixture.
 */
const SAMPLE = 512;

function referenceProfiles(): Profile[] {
  const out: Profile[] = [];
  for (let i = 0; i < SAMPLE; i++) {
    const p: Profile = {};
    /* A different stride per question, so the sample sweeps combinations evenly instead of
       marching every question through its options in lockstep. */
    QUESTIONS.forEach((q, qi) => {
      const opt = q.options[(i * (qi * 2 + 1)) % q.options.length];
      for (const [k, v] of Object.entries(opt.resolves)) {
        p[k] = q.multi ? [String(v)] : (v as never);
      }
    });
    out.push(p);
  }
  return out;
}

/* Computed once, on first use. `discrimination` in candidates.ts calls pickFeatures many
   times per tap, so this must never be per-call work. */
let commonnessCache: Map<string, number> | null = null;
function commonness(id: string): number {
  if (!commonnessCache) {
    const grid = referenceProfiles();
    commonnessCache = new Map(
      FEATURES.map((f) => [f.id, grid.filter((p) => f.matches(p)).length / grid.length]),
    );
  }
  return commonnessCache.get(id) ?? 0;
}

/**
 * How far commonness may pull a feature down the order.
 *
 * At 6, a feature matching everyone loses six points of priority — enough to move
 * `import_email_contacts` (10, matches all) below `invoice_builder` (8, matches half), which
 * is the reordering the whole change is for. Priority still decides between two features of
 * similar reach.
 */
const COMMONNESS_WEIGHT = 6;

/**
 * Feature ids the `extras` question lets someone ask for BY NAME.
 *
 * A tick here is not an inference we drew from their description — it is the person telling us
 * they do this. It outranks `priority`, which is our own ordering of what usually matters.
 *
 * Without this, removing the read-receipts floor would have made things worse rather than
 * better: they would keep their tier (right) and then never see Read Receipts on the reveal
 * (wrong), because at priority 8 it loses to Multi-device support at 9. Someone would tick
 * "Check whether mail was opened" and get a screen that never mentions it.
 */
const TICKED_FEATURE: Record<string, string> = {
  invoices: "invoice_builder",
  campaigns: "email_marketing",
  bookings: "appointment_booking",
  receipts: "read_receipts",
};

/** Did they tick the `extras` option that names this feature? */
function askedForByName(f: Feature, p: Profile): boolean {
  return Object.entries(TICKED_FEATURE).some(
    ([tick, id]) => id === f.id && has(p, "extras", tick),
  );
}

/**
 * Priority, plus a step no ordinary priority can reach for anything they ticked — and a
 * further step for a ticked feature that is TIER-GATED.
 *
 * The second step decides between two ticks. Someone who ticked both invoices and read
 * receipts is on Max because of Invoice Builder; read receipts are on every tier and cost
 * them nothing. Showing Read Receipts next to a Max price would name the one thing on that
 * screen they did not have to pay for. `minMailPlan` already records which is which, so this
 * needs no new data — and it must not reach for the needs table, because candidates.ts
 * imports this file and the cycle is what put `Profile` in its own module.
 */
const rank = (f: Feature, p: Profile) => {
  if (askedForByName(f, p)) return f.priority + 100 + (f.minMailPlan || f.minSitePlan ? 50 : 0);
  return f.priority - COMMONNESS_WEIGHT * commonness(f.id);
};

export function pickFeatures(
  profile: Profile,
  surfaces: FeatureSurface[],
  limit = 2,
  /* The site plan rules.ts settled on. Features the tier does not include are filtered out —
     see `minSitePlan`. Optional so mail-only callers need not pass it. */
  sitePlanId: string | null = null,
  /* The mail plan rules.ts settled on. Same reason as sitePlanId — four features here are
     Max-only and must never be named next to a Starter or Standard price. */
  mailPlanId: string | null = null,
): Feature[] {
  /* A tick is an eligibility route of its own, not just a ranking boost. `invoice_builder`
     matches on `sellsOnline === true`, so the cinema-ticket reseller who ticked "Send quotes
     or invoices" — and was charged Max for it — was filtered out before ranking ever ran and
     could not have been shown whatever we did to the sort. `availableOn` still applies: a tick
     never names a feature the tier they are on does not include. */
  const eligible = FEATURES.filter(
    (f) =>
      (f.matches(profile) || askedForByName(f, profile)) &&
      availableOn(f, sitePlanId, mailPlanId),
  );
  const picked: Feature[] = [];

  for (const surface of surfaces) {
    const best = eligible
      .filter((f) => f.surface === surface)
      .sort((a, b) => rank(b, profile) - rank(a, profile))[0];
    if (best) picked.push(best);
  }

  /**
   * Fill any remaining slots from whichever surface has the better remaining feature.
   *
   * THIS USED TO BE `surfaces.length === 1` ONLY, which made `limit` inert for everyone
   * getting both mail and a site — the common case. Two surfaces filled two slots and the
   * branch never ran, so raising the limit to 3 or 4 changed nothing at all. Measured over 96
   * profiles: 13 distinct bullet sets at limit 2, and exactly 13 at limit 4.
   *
   * One per surface still comes first, above — someone getting both should hear about both
   * before they hear a second thing about either.
   */
  if (picked.length < limit) {
    const more = eligible
      .filter((f) => surfaces.includes(f.surface) && !picked.includes(f))
      .sort((a, b) => rank(b, profile) - rank(a, profile));
    picked.push(...more.slice(0, limit - picked.length));
  }

  return picked.slice(0, limit);
}

/** Model-written `because` clauses, keyed by feature id. Validated server-side. */
export type ReasonMap = Record<string, string>;

/**
 * Overlay a generated reason onto a fixed feature.
 *
 * Only `because` is replaceable. `name` is Neo's own and `id`, `matches`, `minMailPlan` and
 * `minSitePlan` are the contract that decides whether this feature may be shown at all — a
 * generation that could touch those could put a Max-only feature next to a Starter price.
 *
 * Returns the feature unchanged when there is no override, so callers cannot tell the paths
 * apart and a failed generation degrades to exactly what ships today.
 */
export function withReason(f: Feature, reasons?: ReasonMap): Feature {
  const r = reasons?.[f.id]?.trim();
  return r ? { ...f, because: r } : f;
}

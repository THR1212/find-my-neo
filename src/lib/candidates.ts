/**
 * Which setups are still possible, and why.
 *
 * This replaces two if-chains (`chooseMailPlan`, `chooseSitePlan`) whose real problem was not
 * that they were wrong but that they were **unjustifiable**. `mailboxes >= 5 -> Standard`
 * doubled someone's bill for having five people. `personal_email -> Standard` was better
 * sourced and structurally identical: one boolean, a 2x price change, no accumulated evidence.
 * Hari's objection was the right one — a rule that cannot say why it fired should not be
 * setting a price.
 *
 * THE MODEL HERE IS CONSTRAINT SATISFACTION, NOT SCORING, and that distinction is deliberate.
 * CLAUDE.md says "a clever scoring model that nobody can audit is worse here than a short
 * if-chain", and it is right: a weighted score is harder to argue with than an if-chain, not
 * easier. So instead:
 *
 *   an answer establishes a NEED       "you need somewhere enquiries can land"
 *   a need sets a FLOOR on a tier      contact forms are absent on Basic
 *   we recommend the CHEAPEST setup that meets every floor
 *
 * Three properties fall out, and they are the whole reason for the rewrite:
 *
 *  1. **No single answer creates a price cliff.** A tier is only reached if something
 *     genuinely requires it, and the floors compose rather than competing.
 *  2. **The recommendation explains itself.** `solve()` returns the needs that forced each
 *     floor, so "why this plan" is derived from what actually bound, not from a template and
 *     not from a model's opinion. That is the thing competitors do (Mailchimp, Rinda, Cynet —
 *     docs/competitor-qualification.md) and we did not.
 *  3. **It cannot over-serve.** Cheapest-satisfying is a hard rule, which directly answers the
 *     warning in docs/data-findings.md §9 that routing every "I sell online" to a higher tier
 *     over-serves roughly two thirds of them.
 *
 * Every floor traces to `src/data/plan-features.json` — Darrel's Pandora entitlements, which
 * outrank the marketing table and the name config. If you add a need, cite the entitlement.
 */

import plansData from "../data/plans.json";
import { has, type Profile } from "./profile";
import { pickFeatures, type FeatureSurface } from "./features";

export type MailTier = "starter" | "standard" | "max";
export type SiteTier = "none" | "basic" | "plus" | "growth";

export const MAIL_TIERS: MailTier[] = ["starter", "standard", "max"];
export const SITE_TIERS: SiteTier[] = ["none", "basic", "plus", "growth"];

const MAIL_RANK: Record<MailTier, number> = { starter: 0, standard: 1, max: 2 };
const SITE_RANK: Record<SiteTier, number> = { none: 0, basic: 1, plus: 2, growth: 3 };

export interface Candidate {
  mail: MailTier;
  site: SiteTier;
}

/**
 * One thing this business needs, and the lowest tier that provides it.
 *
 * `because` is written in the customer's terms because it is shown to them — this is the
 * justification, not a developer comment. `entitlement` is the Pandora key it rests on, so a
 * reviewer can check the claim rather than trust it.
 */
export interface Need {
  id: string;
  /** Shown on the reveal. Their situation, never a feature name. */
  because: string;
  /** The Pandora entitlement this floor rests on. Auditable, not decorative. */
  entitlement: string;
  minMail?: MailTier;
  minSite?: SiteTier;
  when: (p: Profile) => boolean;
}

/**
 * The needs, each tracing to an entitlement gate.
 *
 * Deliberately short. A need that does not move a floor is not a need, it is a feature
 * bullet, and those live in features.ts. Six more arrive with the new questions that make
 * Max and Growth reachable — see the sequence in DECISIONS.
 */
export const NEEDS: Need[] = [
  {
    id: "somewhere_to_send_people",
    because: "you wanted a site as well as email",
    entitlement: "neo_site",
    minSite: "basic",
    /* Not `has(surface, "both")`: an UNANSWERED surface question must still yield a site,
       because Reveal shows the site block for anything that is not explicitly mail-only. A
       floor that disagreed with what is on screen would print a site next to a mail-only
       price. Only an explicit "just email" removes it. */
    when: (p) => !has(p, "surface", "mail"),
  },
  {
    /* THE one that changed a real recommendation. Basic has no contact form at all —
       Plus 1,000/month, Growth unlimited. An enquiry-led business sent to Basic gets a site
       that cannot do its only job. */
    id: "capture_enquiries",
    because: "people need a way to reach you from the site",
    entitlement: "contact_form",
    minSite: "plus",
    when: (p) => {
      if (has(p, "surface", "mail")) return false;
      /**
       * Only once we KNOW how they are reached.
       *
       * The if-chain this replaced fired on unknown too — "the failure is asymmetric", which
       * was right when nothing would ever ask. Now something does, and firing on unknown has
       * a cost the old design could not have: it forces the site floor to Plus before the
       * first question, so no later answer can change the outcome and every question scores
       * zero narrowing. A need that fires on ignorance makes the whole flow pointless.
       */
      if (p.customerChannel === undefined && p.sellsOnline === undefined) return false;
      /* The one exemption, and it is real: someone whose customers phone them or walk in is
         reachable without a form, and Basic does carry "Business contact info". Dropping this
         when the old if-chain became a need sent a bike shop to Plus for nothing — caught by
         re-running the previous cases against the new solver rather than by reading it. */
      const offlineOnly =
        has(p, "customerChannel", "offline") &&
        !has(p, "customerChannel", "social") &&
        !has(p, "customerChannel", "personal_email") &&
        !has(p, "customerChannel", "site");
      return !offlineOnly;
    },
  },
  {
    id: "show_what_you_sell",
    because: "you take orders or payments online",
    entitlement: "site_products",
    minSite: "plus",
    /* Guarded on mail-only like every other site floor. Without it, "just email" plus "I sell
       online" is UNSATISFIABLE — no candidate has both no site and a Plus site — and survivors
       drops to zero. The probe caught that; reading the needs list would not have. */
    when: (p) => !has(p, "surface", "mail") && has(p, "sellsOnline", true),
  },
  {
    /* Signature Designer is Standard and above (Pandora). "Looks like it came from a real
       business" is exactly the move off a personal Gmail. */
    id: "look_established",
    because: "you're moving off a personal address",
    entitlement: "signature_builder",
    minMail: "standard",
    when: (p) => has(p, "customerChannel", "personal_email"),
  },

  /* --- The floors that reach Max and Growth ---------------------------------------------
   *
   * Before these, `max` and `growth` sat in plans.json and in the candidate set with no code
   * path able to return them. Each floor below is a Pandora entitlement, not a judgement:
   * Invoice Builder, AI Email Writer and Campaign Mode are explicitly disabled below Max, and
   * Growth is the only tier with unlimited listings.
   *
   * Storage leads because docs/data-findings.md §5 measured it: `Storage Banner` is the
   * dominant paywall trigger in every single industry, 32-52% of conversions. Read receipts
   * are next at 8-12%. These are the two the data actually supports; the rest are here because
   * the entitlement is unambiguous.
   */
  {
    id: "room_for_big_files",
    because: "you send large files often",
    entitlement: "storage",
    /* Storage is PER MAILBOX (Neo's own catalogue: "allotted for each mailbox that is
       created"), so this is about what one person sends, not how many people there are. */
    minMail: "max",
    when: (p) => has(p, "attachmentVolume", "heavy"),
  },
  {
    id: "room_for_attachments",
    because: "you send photos and documents",
    entitlement: "storage",
    minMail: "standard",
    when: (p) => has(p, "attachmentVolume", "docs"),
  },
  {
    /**
     * THE FLOOR SITS ON THE GATE, not only on the detail behind it — and the first attempt at
     * this split got it wrong in a way worth recording.
     *
     * `inbox` was added as a binary in front of `extras`, and `extras` gated on it. But every
     * need keyed on `extras` values, so answering `inbox` moved no floor, `discrimination`
     * scored it ZERO, and the engine — correctly, by its own rule — never asked it. Which
     * gated `extras` out permanently. A florist who genuinely invoices came back Starter: the
     * split had not made Max rarer, it had made it unreachable.
     *
     * A gate question has to be worth asking on its own terms. So the yes answer carries the
     * floor, and the three needs below only explain WHICH thing earned it.
     */
    id: "runs_from_the_inbox",
    because: "you want Neo running quotes, campaigns or bookings for you",
    entitlement: "invoice_builder",
    minMail: "max",
    /**
     * ONLY WHILE `extras` IS UNANSWERED. This is a gap-filler, not a second opinion.
     *
     * It read "yes AND none of the three Max extras present", which is also true once the
     * detail HAS been answered and none of them was chosen. Run cz3npnaz at 16:06: they
     * answered yes, were asked which, picked only "Check whether mail was opened" — a feature
     * on every tier — and were charged Max ₹599 for it. The question they answered to say
     * "none of the expensive things" was read as "all of them".
     *
     * `extras === undefined` is the honest test: cover the yes whose detail we never asked,
     * and step aside the moment they tell us. Note it cannot use `has()` — the question is
     * whether the signal exists at all, not what it holds.
     */
    when: (p) => has(p, "inboxTools", true) && p.extras === undefined,
  },
  {
    /**
     * One need per Max entitlement, all reading the same multi-select answer.
     *
     * Kept as four separate needs rather than one, because the `because` line must name the
     * thing THEY said — "you send quotes and invoices" is a reason, "you selected an option
     * that requires Max" is not. Several can bind at once, and the reveal lists each.
     */
    id: "bill_from_your_inbox",
    because: "you send quotes and invoices",
    entitlement: "invoice_builder",
    minMail: "max",
    when: (p) => has(p, "extras", "invoices"),
  },
  {
    id: "reach_everyone_at_once",
    because: "you message past customers as a group",
    entitlement: "email_marketing",
    minMail: "max",
    when: (p) => has(p, "extras", "campaigns"),
  },
  {
    id: "let_people_book",
    because: "people book time with you",
    entitlement: "appointment_booking",
    minMail: "max",
    when: (p) => has(p, "extras", "bookings"),
  },
  /* THERE IS NO `know_it_was_read` NEED, and the plan data is why.
   *
   * It was here until 03 Sep, forcing Max on anyone who ticked "Check whether mail was
   * opened". But Pandora says read receipts are on **all three** tiers — Starter simply caps
   * them at 50 a month, Standard is a 90-day trial, Max is unlimited. So the entitlement is
   * not gated at Max; only the *unlimited* version is.
   *
   * A floor here therefore charged everyone Max for a cap we have no way of knowing they would
   * hit. A solo operator with one mailbox does not send 50 tracked emails a month, and we do
   * not ask anything that would tell us either way. This file's own rule settles it: a need
   * that does not move a floor is not a need, it is a feature bullet — so Read Receipts is one,
   * and features.ts surfaces it on whatever tier they land on.
   *
   * The cost of the mistake, on a real run (sid hmcrd0yw, a solo cinema-ticket reseller):
   * Rs958 with the tick, Rs658 without. Invoice Builder still put them on Max, because that
   * one genuinely is Max-only — which is the difference between our modelling error and Neo's
   * actual gating. */
  {
    id: "a_real_catalogue",
    because: "you have hundreds of things to list",
    /* Plus caps products, services and gallery at 500 each; Growth is unlimited. */
    entitlement: "site_products",
    minSite: "growth",
    when: (p) => !has(p, "surface", "mail") && has(p, "catalogueSize", "hundreds"),
  },
];

export function needsFor(profile: Profile): Need[] {
  return NEEDS.filter((n) => n.when(profile));
}

/** Every candidate that is coherent for this profile, before needs are applied. */
export function allCandidates(profile: Profile): Candidate[] {
  /* Mail-only is a hard constraint, not a need: someone who said "just email" must not be
     sold a site, however much anything else would like to raise the floor. */
  const mailOnly = has(profile, "surface", "mail");
  const out: Candidate[] = [];
  for (const mail of MAIL_TIERS) {
    for (const site of SITE_TIERS) {
      if (mailOnly && site !== "none") continue;
      out.push({ mail, site });
    }
  }
  return out;
}

/** Does this candidate meet every floor the needs impose? */
export function satisfies(c: Candidate, needs: Need[]): boolean {
  for (const n of needs) {
    if (n.minMail && MAIL_RANK[c.mail] < MAIL_RANK[n.minMail]) return false;
    if (n.minSite && SITE_RANK[c.site] < SITE_RANK[n.minSite]) return false;
  }
  return true;
}

/** Candidates still viable given what we know so far. The narrowing, made literal. */
export function survivors(profile: Profile): Candidate[] {
  const needs = needsFor(profile);
  return allCandidates(profile).filter((c) => satisfies(c, needs));
}

const MAIL = plansData.mail.plans as { id: string; inr: Record<string, number | null> }[];
const SITE = plansData.site.live as { id: string; inr: Record<string, number> }[];

/**
 * Monthly cost of a candidate, so "cheapest satisfying" is a real comparison rather than a
 * guess from tier order. Mail is per mailbox; site is flat.
 */
export function costOf(c: Candidate, mailboxes: number, cycle: string): number | null {
  const mail = MAIL.find((p) => p.id === c.mail);
  if (!mail) return null;
  const mailUnit = mail.inr[cycle] ?? mail.inr.monthly ?? null;
  if (mailUnit === null) return null;
  if (c.site === "none") return mailUnit * mailboxes;
  const site = SITE.find((p) => p.id === c.site);
  if (!site) return null;
  const siteUnit = site.inr[cycle] ?? site.inr.monthly ?? null;
  if (siteUnit === null || siteUnit === undefined) return null;
  return mailUnit * mailboxes + siteUnit;
}

export interface Solution {
  candidate: Candidate;
  /** The needs that actually bound a floor. This is the justification. */
  binding: Need[];
  /** Everything still viable, cheapest first. Feeds "why not the cheaper one". */
  viable: Candidate[];
}

/**
 * Cheapest setup meeting every need.
 *
 * Cheapest rather than best-fitting is the anti-over-serving rule, and it is not a
 * preference: docs/data-findings.md §9 measured that routing every "I take payments" answer
 * to a higher site tier over-serves about two thirds of them.
 */
export function solve(profile: Profile, mailboxes: number, cycle: string): Solution {
  const needs = needsFor(profile);
  const viable = survivors(profile).sort((a, b) => {
    const ca = costOf(a, mailboxes, cycle);
    const cb = costOf(b, mailboxes, cycle);
    if (ca === null) return 1;
    if (cb === null) return -1;
    if (ca !== cb) return ca - cb;
    /* Equal cost: prefer the lower tiers, so a tie never silently upsells. */
    return MAIL_RANK[a.mail] + SITE_RANK[a.site] - (MAIL_RANK[b.mail] + SITE_RANK[b.site]);
  });

  /**
   * Empty means the needs contradict each other, which is a bug in the needs rather than a
   * situation a customer can be in. Falling back silently would hide it, so drop the site
   * floors (the only ones that can conflict with the mail-only constraint), keep the mail
   * floors, and let it be visible in the run record as an empty `viable`.
   */
  const candidate =
    viable[0] ??
    allCandidates(profile).filter((c) =>
      satisfies(c, needs.filter((n) => !n.minSite)),
    )[0] ?? { mail: "starter", site: "none" };

  /* Only the needs that actually forced this candidate above the floor of its dimension —
     a need satisfied by the baseline anyway explains nothing and would pad the reveal. */
  const binding = needs.filter(
    (n) =>
      (n.minMail && MAIL_RANK[n.minMail] > 0) || (n.minSite && SITE_RANK[n.minSite] > 0),
  );

  return { candidate, binding, viable };
}

/**
 * Would asking this question change anything we show them?
 *
 * The measure is **how many different outcomes the answers lead to**, normalised:
 *
 *     score = (distinct recommended setups across the options - 1) / (options - 1)
 *
 * 0 means every answer produces the identical recommendation, so asking is pure drop-off.
 * 1 means every answer leads somewhere different.
 *
 * THIS DEFINITION IS THE THIRD ATTEMPT, and both earlier ones failed in ways worth keeping
 * on record, because both looked right:
 *
 *  1. **Gini impurity of the partition.** Measures how EVENLY a question splits the field, not
 *     how much it shrinks it. A question that discriminates not at all leaves every option
 *     holding the full set — perfectly even — so it scored highest. `import` and `client`
 *     outranked `surface`.
 *  2. **Expected reduction in surviving candidates.** Correct in the common direction and
 *     blind in the other. Learning someone is reached by phone alone REMOVES the contact-form
 *     floor, so the candidate set GROWS and expected reduction goes negative, clamped to zero.
 *     The result: a phone-and-walk-in business was never asked how customers reach them and
 *     was billed for Plus, because the question that would have saved them ₹90/month scored as
 *     uninformative. An engine optimising for a smaller set rather than a better answer.
 *
 * The fix is to score the DECISION, not the set. What matters is whether the recommendation
 * moves, in whichever direction — which is the value of information for the choice actually
 * being made. Set size was always a proxy, and a proxy that disagreed with the goal.
 *
 * Deliberately arithmetic and deliberately here rather than in a prompt: the literature is
 * clear that LLMs are inconsistent probabilistic reasoners (arxiv 2605.06915), so this stays
 * in code and the model is left to read prose, which it is good at.
 */
export function discrimination(
  profile: Profile,
  question: { id: string; signal: string; options: { resolves: Record<string, unknown> }[] },
  /**
   * "plan" ignores the feature lines, so it answers the narrower question: would this change
   * what they PAY? Used for the stopping rule, where the two must be separated — see
   * `shouldReveal`. Ordering always uses the full outcome.
   */
  scope: "outcome" | "plan" = "outcome",
): number {
  const opts = question.options;
  if (opts.length < 2) return 0;

  const cycle = "yearly";
  const outcomes = new Set<string>();

  for (const opt of opts) {
    /* Apply the option exactly as applyAnswer would, so the simulation cannot drift from what
       happens when someone actually taps it. */
    const hypothetical: Profile = { ...profile };
    for (const [k, v] of Object.entries(opt.resolves)) {
      hypothetical[k] = v as Profile[string];
    }
    /**
     * THE OUTCOME INCLUDES THE MAILBOX COUNT, and it has to.
     *
     * Scoring only the tier pair made `team` worth zero — mailbox count deliberately does not
     * select a tier — so the engine stopped asking it, and the single largest multiplier on
     * the bill was left to a default of 2. The recommendation a person receives is "Starter,
     * two mailboxes, ₹298" and the count is part of it, so it belongs in the outcome.
     */
    const mailboxes =
      Number(hypothetical.mailboxCount) || Number(hypothetical.teamSize) || 2;
    const best = solve(hypothetical, mailboxes, cycle).candidate;

    /**
     * THE OUTCOME IS THE WHOLE REVEAL, not just the plan.
     *
     * Scoring the plan alone made `importIntent` and `currentClient` worth zero, because no
     * need reads them — Pandora puts import and Gmail sync on every mail tier, so there is
     * genuinely no plan consequence. But they decide which feature lines appear, and a
     * question that changes what someone READS is informative even when it changes nothing
     * they PAY. Stopping before them left the reveal's "Worth knowing" block generic.
     *
     * The same oversight as the mailbox count above, noticed for one signal and not the
     * other: "outcome" has to mean everything the reveal renders.
     */
    const surfaces: FeatureSurface[] = best.site === "none" ? ["mail"] : ["mail", "site"];
    const features = pickFeatures(
      hypothetical,
      surfaces,
      2,
      best.site === "none" ? null : best.site,
      best.mail,
    )
      .map((f) => f.id)
      .join(",");

    outcomes.add(
      scope === "plan"
        ? `${best.mail}/${best.site}/${mailboxes}`
        : `${best.mail}/${best.site}/${mailboxes}/${features}`,
    );
  }

  return (outcomes.size - 1) / (opts.length - 1);
}

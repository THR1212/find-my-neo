/**
 * Profile → plan. Deterministic, and the model never touches it.
 *
 * This is the answer to "what if it hallucinates a price": it can't, because it is never asked.
 * The model returns a profile; this file turns a profile into a plan; `plans.json` holds the
 * numbers, taken from Neo's own pricing sheet.
 *
 * Keep the rules boring and legible. Someone from Neo product should be able to read this
 * function and say "yes, that's what we'd recommend too" — or tell us exactly which line is
 * wrong. A clever scoring model that nobody can audit is worse here than a short if-chain.
 */

import plansData from "../data/plans.json";
import { has, type Profile } from "./engine";

export type BillingCycle = "monthly" | "quarterly" | "yearly" | "twoYearly" | "fourYearly";

interface MailPlanJson {
  id: string;
  name: string;
  inr: Partial<Record<BillingCycle, number | null>>;
  afterFirstCycleInr: number;
  blurb: string;
}

interface SitePlanJson {
  id: string;
  name: string;
  inr: Partial<Record<BillingCycle, number>>;
}

const MAIL = plansData.mail.plans as MailPlanJson[];
/* `live` deliberately, not `v3Freemium` — live is what neo.space shows today. Quoting an
   unreleased price set as current is the kind of error that loses a pricing conversation. */
const SITE = plansData.site.live as SitePlanJson[];

export interface Recommendation {
  mailPlan: MailPlanJson;
  sitePlan: SitePlanJson | null;
  cycle: BillingCycle;
  mailboxes: number;
  /** Total INR per month at the chosen cycle. Null if any component price is unavailable. */
  monthlyInr: number | null;
  /** One sentence the reveal can show. Must be defensible, not salesy. */
  rationale: string;
}

const byId = <T extends { id: string }>(list: T[], id: string): T =>
  list.find((p) => p.id === id) ?? list[0];

/**
 * Billing cycle.
 *
 * Yearly by default rather than monthly, and this is a deliberate strategic choice, not a
 * revenue grab: two-yearly billing retained at 73.0% against 30.9% monthly, with yearly at
 * 45.3% in between. Those numbers are now **verified from source** rather than inherited —
 * recomputed on 18,399 deduped orders, and confirmed in the same direction on a second,
 * much larger dataset (22.0% vs 3.7% m12 across 153,673 accounts, a 5.9x gap that survives
 * holding mailbox count fixed). See docs/data-findings.md §1b and §2.
 *
 * Recommending the cycle that correlates with people actually staying is the "quality of
 * users acquired" argument (KR4), and it is the honest version of an upsell.
 *
 * The caveat, because it belongs next to the number: this is correlational. Committing to
 * two years does not *cause* retention — the kind of customer who commits is the kind who
 * stays. A yearly default may sort customers rather than save them.
 *
 * We do not push past yearly. Two- and four-yearly are cheaper per month but ask a brand-new
 * business to commit years upfront, which is a worse experience than the saving is worth.
 */
function chooseCycle(profile: Profile): BillingCycle {
  // Someone who hasn't decided what they're even setting up shouldn't be nudged to commit.
  if (profile.surface === undefined) return "monthly";
  return "yearly";
}

/**
 * Starter is the floor. There is nothing below it.
 *
 * This used to drop a solo, non-importing, mail-only person onto **Neo Lite** at ₹59. Lite is
 * in Neo's pricing sheet but **Neo does not sell it** (confirmed 03 Sep 2026), so that branch
 * recommended a plan, showed its real price, and handed the person to a checkout that cannot
 * fulfil it — the worst class of error this project can make, because everything else on the
 * reveal is defensible and this one number quietly was not.
 *
 * The lesson is more general than the plan: **the pricing sheet is not the offering.** Do not
 * re-derive a recommendable plan from `plans.json` without checking it is actually purchasable.
 *
 * Note what this removes: `importIntent` no longer gates any plan at all. It now only colours
 * a feature bullet, which makes its 0.15 weight the least justified in the bank — see the
 * note in questions.ts. Flagged rather than silently re-tuned, because weights are data-derived.
 */
function chooseMailPlan(_profile: Profile, mailboxes: number): MailPlanJson {
  // Bigger teams get more storage and the fuller feature set.
  if (mailboxes >= 5) return byId(MAIL, "standard");

  return byId(MAIL, "starter");
}

/**
 * Site plan. Gated on what each tier can actually DO, not on storage.
 *
 * Rewritten 03 Sep 2026 against Neo's own site feature table (`src/data/site-features.json`,
 * read from their pricing page), which corrected a real mis-recommendation:
 *
 *   **Basic has no Contact Forms at all.** Plus gets 1,000, Growth unlimited. Basic carries
 *   only "Business contact info" — a phone number and address printed on the page.
 *
 * The old rule sent everyone who was NOT selling online to Basic. That is precisely the
 * enquiry-led business — "no, they enquire, then we arrange it" — whose site exists to
 * collect an enquiry. We were recommending the one tier that cannot capture a lead, and
 * saying so on a screen next to a real price.
 *
 * The honest split is by how someone is reached, not by whether money moves:
 *   - reachable offline (phone, walk-ins) and not selling -> Basic genuinely is enough;
 *     business contact info is the whole job, and Basic does it.
 *   - anyone who needs a form, testimonials, a subscribe box or their own branding -> Plus.
 *   - a real catalogue on a multi-person operation -> Growth.
 *
 * On Growth: it was previously UNREACHABLE — `plans.json` lists it and this function could
 * never return it (docs/data-findings.md §9 caught this). It is a catalogue-size tier
 * (unlimited products/services/gallery, premium fonts, priority support), so it is gated on
 * selling online AND enough mailboxes to imply someone is minding the shop.
 *
 * The caveat that belongs next to this, from our own data: §9 finds only 3.5% of all orders
 * ever build an order form, 31% even on Plus, and warns that routing every "I take payments"
 * answer to Plus over-serves roughly two thirds of them. That warning stands. What changed is
 * the REASON for Plus — contact forms, which an enquiry business demonstrably needs, rather
 * than order forms, which most never touch. If we later get per-plan conversion data, this is
 * the function to revisit first.
 */
function chooseSitePlan(profile: Profile, mailboxes: number): SitePlanJson | null {
  if (has(profile, "surface", "mail")) return null;

  const sells = has(profile, "sellsOnline", true);
  if (sells && mailboxes >= 5) return byId(SITE, "growth");
  if (sells) return byId(SITE, "plus");

  /* Not selling. Basic only if they are genuinely reachable without a form — someone whose
     customers phone them or walk in. Everyone else needs the form Basic does not have. */
  const offlineOnly =
    has(profile, "customerChannel", "offline") &&
    !has(profile, "customerChannel", "social") &&
    !has(profile, "customerChannel", "personal_email") &&
    !has(profile, "customerChannel", "site");
  if (offlineOnly) return byId(SITE, "basic");

  /* Includes the case where the channel question was never asked. Unknown defaults to the
     tier that can capture a lead, because the failure is asymmetric: recommending Plus to
     someone who needed Basic costs them money they can downgrade, while recommending Basic to
     someone who needed a form gives them a site that cannot do its one job. */
  return byId(SITE, "plus");
}

export function recommend(profile: Profile, suggestedMailboxes: number): Recommendation {
  /* `mailboxCount` first: it is what the question actually asks for. `teamSize` is the
     model's headcount read of the free text and only stands in when the mailbox question
     never got asked — it under-counts, because most Neo domains run role addresses on top
     of the people (docs/data-findings.md §7). */
  const mailboxes = Math.max(
    1,
    (profile.mailboxCount as number) || (profile.teamSize as number) || suggestedMailboxes || 1,
  );
  const cycle = chooseCycle(profile);
  const mailPlan = chooseMailPlan(profile, mailboxes);
  const sitePlan = chooseSitePlan(profile, mailboxes);

  const mailUnit = mailPlan.inr[cycle] ?? mailPlan.inr.monthly ?? null;
  const siteUnit = sitePlan ? (sitePlan.inr[cycle] ?? sitePlan.inr.monthly ?? null) : 0;

  const monthlyInr =
    mailUnit === null || siteUnit === null ? null : mailUnit * mailboxes + siteUnit;

  return {
    mailPlan,
    sitePlan,
    cycle,
    mailboxes,
    monthlyInr,
    rationale: buildRationale(profile, mailPlan, sitePlan, mailboxes),
  };
}

function buildRationale(
  profile: Profile,
  mailPlan: MailPlanJson,
  sitePlan: SitePlanJson | null,
  mailboxes: number,
): string {
  const who = mailboxes === 1 ? "One mailbox" : `${mailboxes} mailboxes`;
  if (mailPlan.id === "lite") return `${who} is all you need for now — you can add more later.`;
  if (profile.importIntent && !has(profile, "importIntent", "none"))
    return `${who}, with your existing mail brought across.`;
  if (sitePlan) return `${who} plus a one-page site, on your own domain.`;
  return `${who} on your own domain.`;
}

export const CYCLE_LABEL: Record<BillingCycle, string> = {
  monthly: "billed monthly",
  quarterly: "billed quarterly",
  yearly: "billed yearly",
  twoYearly: "billed every 2 years",
  fourYearly: "billed every 4 years",
};

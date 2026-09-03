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
 * Mail tier. Chosen by what someone NEEDS, never by how many mailboxes they have.
 *
 * This used to read `if (mailboxes >= 5) return standard`, and that rule had no basis. Neo
 * prices mail **per mailbox**, so a 5-person business was quoted 5 x ₹299 = ₹1,495/mo where
 * 5 x ₹149 = ₹745/mo would have done — **double the price for having five people**, justified
 * by nothing.
 *
 * The tempting defence was storage, and Neo's own catalogue kills it: `storage` is "Storage
 * space allotted for **each mailbox** that is created." Per mailbox. Adding mailboxes adds
 * storage; it never exhausts a tier. Count multiplies the bill and must not also select the
 * tier, or it is charged for twice.
 *
 * So the tier gates on capability, like `chooseSitePlan` — but note the asymmetry that makes
 * this one deliberately narrower. Basic genuinely *cannot* capture a lead, so Plus was a
 * capability floor. Nothing on Starter is broken; Standard is polish. A weaker reason to
 * upgrade deserves a stricter rule.
 *
 * **Standard on exactly one signal:** someone whose customers currently reach them at a
 * personal address. Signature Designer is Standard-and-above (Pandora), and "every mail you
 * send looks like it came from a real business" is precisely the move from a personal Gmail to
 * their own domain. Company branding and unlimited templates come with it.
 *
 * **Max stays unreachable, on purpose.** Its exclusives are Invoice Builder, AI Email Writer
 * and Campaign Mode, so the tempting rule is `sellsOnline -> max`. That is a **4x jump on one
 * boolean**, and docs/data-findings.md §9 is explicit that only 3.5% of orders ever build an
 * order form (31% even on Plus) — the exact over-serve it warns about. Inventing a route to
 * Max is a worse answer than leaving the question open. See plan-features.json `_openQuestion`.
 */
function chooseMailPlan(profile: Profile): MailPlanJson {
  /* Worth knowing, because it is the trade-off this design accepts: mail is priced per
     mailbox, so a capability-driven tier bump MULTIPLIES. Standard on 8 mailboxes is
     ₹2,392/mo against Starter's ₹1,192. That is the right shape (they need the feature on
     every mailbox) and it is bounded in practice, because this product is scoped at 1-3
     person businesses where the gap is ₹150/mo. If we ever widen that scope, revisit. */
  if (has(profile, "customerChannel", "personal_email")) return byId(MAIL, "standard");
  return byId(MAIL, "starter");
}

/**
 * Site tier.
 *
 * **Growth is deliberately unreachable**, and this is the same argument that keeps Max
 * unreachable, applied consistently. This morning `growth` was gated on
 * `sellsOnline && mailboxes >= 5` — mailbox count standing in for "a real operation". That is
 * the identical fault just removed from `chooseMailPlan`, wearing a different hat: a count that
 * says nothing about the thing the tier actually sells.
 *
 * What separates Growth from Plus is catalogue size — unlimited products, services and gallery
 * against Plus's 500 — plus premium fonts and priority support. **A 1-3 person business does
 * not have 500 products.** CLAUDE.md scopes this product at 1-3 person businesses with no
 * 50-200 employee branch, so Growth is out of scope by design rather than by oversight. If a
 * catalogue-size signal ever exists, that is what should gate it — not headcount, and not
 * mailboxes.
 */
function chooseSitePlan(profile: Profile): SitePlanJson | null {
  if (has(profile, "surface", "mail")) return null;

  if (has(profile, "sellsOnline", true)) return byId(SITE, "plus");

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
  const mailPlan = chooseMailPlan(profile);
  const sitePlan = chooseSitePlan(profile);

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
    rationale: buildRationale(profile, sitePlan, mailboxes),
  };
}

/**
 * The FALLBACK rationale, and it must stay.
 *
 * `/api/rationale` writes a better one with the whole run in hand, but it is the only model
 * call in the flow with nothing behind it — the other three degrade to fixed wording, fixed
 * `because` strings, and a recorded site. Without these four templates a failed generation
 * would leave a blank line on the one screen CLAUDE.md says must be perfect.
 */
export function buildRationale(
  profile: Profile,
  sitePlan: SitePlanJson | null,
  mailboxes: number,
): string {
  const who = mailboxes === 1 ? "One mailbox" : `${mailboxes} mailboxes`;
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

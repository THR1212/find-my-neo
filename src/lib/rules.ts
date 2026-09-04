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
import { has, type Profile } from "./profile";
import { solve, type Candidate, type Need } from "./candidates";

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

/** One row of the price breakdown. `each` is null where the line is not per-unit. */
export interface PriceLine {
  label: string;
  /** Per-unit price at the chosen cycle. */
  each: number | null;
  /** How many units. 1 for the site. */
  qty: number;
  /** each * qty, or null when the sheet has no figure. */
  totalInr: number | null;
}

export interface Recommendation {
  mailPlan: MailPlanJson;
  sitePlan: SitePlanJson | null;
  cycle: BillingCycle;
  mailboxes: number;
  /** Total INR per month at the chosen cycle. Null if any component price is unavailable. */
  monthlyInr: number | null;
  /**
   * The same total, itemised.
   *
   * A single "Rs2,665/mo" is the most opaque thing on the reveal, and it is opaque in the one
   * direction that matters: mail is priced PER MAILBOX, so four addresses on Max is four times
   * a number nobody was shown. Someone reading it cannot tell whether the tier or the mailbox
   * count drove it, which is exactly the "why is this Max?" question the needs list exists to
   * answer — and the needs list cannot answer it, because the multiplication is not a need.
   *
   * Derived here rather than in the reveal so the parts always sum to `monthlyInr`; a
   * breakdown assembled beside the total is a breakdown that can disagree with it.
   */
  lines: PriceLine[];
  /**
   * The needs that forced this shape above the baseline — the justification, derived rather
   * than templated. Each carries the Pandora entitlement it rests on, so a reviewer can check
   * the claim instead of trusting it.
   */
  needs: Need[];
  /** Every setup still viable, cheapest first. Feeds "why not the cheaper one". */
  viable: Candidate[];
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
 * Plan choice now lives in `candidates.ts`.
 *
 * `chooseMailPlan` and `chooseSitePlan` were deleted rather than moved, because the problem
 * with them was structural: each was a short if-chain in which one boolean set a tier, so no
 * recommendation could say why it fired. `solve()` instead collects the NEEDS a profile
 * establishes, turns each into a floor on a tier that traces to a Pandora entitlement, and
 * returns the cheapest setup meeting all of them — plus the needs that bound, which is the
 * justification the reveal shows.
 */

/**
 * What a given mail/site pair costs. No opinion about whether it is the RIGHT pair.
 *
 * Split out of `recommend` so a second caller can price a combination the solver did not
 * choose — specifically the cheaper tier the reveal offers, which the person can accept.
 *
 * This deliberately has NO floor check, and `recommend`'s rank guard is deliberately left
 * alone rather than relaxed to accommodate it. Those two facts belong together: the guard
 * exists to stop the MODEL selecting a tier below the solved floor, and a person choosing to
 * spend less on their own business is a different actor with different authority. Widening
 * the guard would have given the model that authority as a side effect.
 *
 * Prices still come from `plans.json` and nowhere else, so nothing here can invent a figure.
 */
export function priceAs(
  mailId: string,
  siteId: string,
  mailboxes: number,
  cycle: BillingCycle,
): {
  mailPlan: MailPlanJson;
  sitePlan: SitePlanJson | null;
  monthlyInr: number | null;
  lines: PriceLine[];
} {
  const mailPlan = byId(MAIL, mailId);
  const sitePlan = siteId === "none" ? null : byId(SITE, siteId);

  const mailUnit = mailPlan.inr[cycle] ?? mailPlan.inr.monthly ?? null;
  const siteUnit = sitePlan ? (sitePlan.inr[cycle] ?? sitePlan.inr.monthly ?? null) : 0;

  const monthlyInr =
    mailUnit === null || siteUnit === null ? null : mailUnit * mailboxes + siteUnit;

  const lines: PriceLine[] = [
    {
      label: mailPlan.name,
      each: mailUnit,
      qty: mailboxes,
      totalInr: mailUnit === null ? null : mailUnit * mailboxes,
    },
  ];
  /* Only when there IS a site. A "Rs0 site" row on a mail-only setup would invite the reader
     to wonder what they are not being charged for. */
  if (sitePlan) {
    lines.push({
      label: `${sitePlan.name} site`,
      each: siteUnit,
      qty: 1,
      totalInr: siteUnit,
    });
  }

  return { mailPlan, sitePlan, monthlyInr, lines };
}

export function recommend(
  profile: Profile,
  suggestedMailboxes: number,
  /**
   * Tiers the model raised to, already verified server-side (api/_lib/planService.ts).
   *
   * Applied AFTER the solver, never instead of it: `solve` still computes the floors and the
   * needs that bound, and this can only sit at or above that answer. The verification lives on
   * the server, but the shape of the power is enforced here too — a verdict that tried to go
   * lower is ignored rather than trusted, because two cheap checks beat one.
   */
  override?: { mail: string; site: string } | null,
): Recommendation {
  /* `mailboxCount` first: it is what the question actually asks for. `teamSize` is the
     model's headcount read of the free text and only stands in when the mailbox question
     never got asked — it under-counts, because most Neo domains run role addresses on top
     of the people (docs/data-findings.md §7). */
  const mailboxes = Math.max(
    1,
    (profile.mailboxCount as number) || (profile.teamSize as number) || suggestedMailboxes || 1,
  );
  const cycle = chooseCycle(profile);
  const solution = solve(profile, mailboxes, cycle);

  const RANK_MAIL: Record<string, number> = { starter: 0, standard: 1, max: 2 };
  const RANK_SITE: Record<string, number> = { none: 0, basic: 1, plus: 2, growth: 3 };
  const chosenMail =
    override && (RANK_MAIL[override.mail] ?? -1) > RANK_MAIL[solution.candidate.mail]
      ? override.mail
      : solution.candidate.mail;
  const chosenSite =
    override && (RANK_SITE[override.site] ?? -1) > RANK_SITE[solution.candidate.site]
      ? override.site
      : solution.candidate.site;

  const { mailPlan, sitePlan, monthlyInr, lines } = priceAs(chosenMail, chosenSite, mailboxes, cycle);

  return {
    mailPlan,
    sitePlan,
    cycle,
    mailboxes,
    monthlyInr,
    lines,
    /* What actually forced this shape. Empty means the baseline was enough, which is itself
       worth saying: "Starter is genuinely all you need" is a trust-building sentence. */
    needs: solution.binding,
    viable: solution.viable,
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

/**
 * What Neo charges for the `.co.site` subdomain in the FIRST billing cycle, per month.
 *
 * Darrel's, restored 03 Sep when .co.site came back in. Read from `plans.json` rather than
 * hardcoded as "free", because it is free only on some cycles: 0/mo monthly and yearly, but
 * Rs25/mo two-yearly and Rs37.50/mo four-yearly. `chooseCycle` returns only monthly or yearly
 * today, so the answer is always 0 right now — which is exactly why it is derived. The day
 * the engine recommends a two-year commitment, the reveal stops saying "Free" by itself,
 * not because someone remembered to change a string.
 *
 * Null when the sheet has no figure for that cycle: unknown, so claim nothing.
 */
export function domainFirstCycleInr(cycle: BillingCycle): number | null {
  const promo = plansData.domain.promoInrPerMonth as Partial<Record<BillingCycle, number>>;
  return promo[cycle] ?? null;
}

export const CYCLE_LABEL: Record<BillingCycle, string> = {
  monthly: "billed monthly",
  quarterly: "billed quarterly",
  yearly: "billed yearly",
  twoYearly: "billed every 2 years",
  fourYearly: "billed every 4 years",
};

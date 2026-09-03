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

export interface Recommendation {
  mailPlan: MailPlanJson;
  sitePlan: SitePlanJson | null;
  cycle: BillingCycle;
  mailboxes: number;
  /** Total INR per month at the chosen cycle. Null if any component price is unavailable. */
  monthlyInr: number | null;
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

  const mailPlan = byId(MAIL, chosenMail);
  const sitePlan = chosenSite === "none" ? null : byId(SITE, chosenSite);

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
 * Read from `plans.json` rather than hardcoded as "free", because it is only free on some
 * cycles: the promo is \u20b90/mo on monthly and yearly but \u20b925/mo on two-yearly and \u20b937.50/mo on
 * four-yearly. `chooseCycle` returns only monthly or yearly today, so the answer is always 0
 * right now — which is exactly why this should be derived and not asserted. The day someone
 * makes the engine recommend a two-year commitment, the reveal must stop saying "Free" by
 * itself, not because a person remembered to come back and change a string.
 *
 * Returns null when the sheet has no figure for that cycle: unknown, so claim nothing.
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

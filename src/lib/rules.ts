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
import type { Profile } from "./engine";

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
 * revenue grab: in the persona data two-yearly billing retained at 73% against 31% monthly.
 * Recommending the cycle that correlates with people actually staying is the "quality of users
 * acquired" argument (KR4), and it is the honest version of an upsell.
 *
 * We do not push past yearly. Two- and four-yearly are cheaper per month but ask a brand-new
 * business to commit years upfront, which is a worse experience than the saving is worth.
 */
function chooseCycle(profile: Profile): BillingCycle {
  // Someone who hasn't decided what they're even setting up shouldn't be nudged to commit.
  if (profile.surface === undefined) return "monthly";
  return "yearly";
}

function chooseMailPlan(profile: Profile, mailboxes: number): MailPlanJson {
  // Solo, no import, no site — Lite is genuinely enough, and saying so builds trust.
  const solo = mailboxes <= 1;
  const importing = profile.importIntent !== undefined && profile.importIntent !== "none";
  if (solo && !importing && profile.surface === "mail") return byId(MAIL, "lite");

  // Bigger teams get more storage and the fuller feature set.
  if (mailboxes >= 5) return byId(MAIL, "standard");

  return byId(MAIL, "starter");
}

function chooseSitePlan(profile: Profile): SitePlanJson | null {
  if (profile.surface === "mail") return null;
  // Selling online means products, images and a contact path — Basic's 1 GB gets tight.
  if (profile.sellsOnline === true) return byId(SITE, "plus");
  return byId(SITE, "basic");
}

export function recommend(profile: Profile, suggestedMailboxes: number): Recommendation {
  const mailboxes = Math.max(1, (profile.teamSize as number) || suggestedMailboxes || 1);
  const cycle = chooseCycle(profile);
  const mailPlan = chooseMailPlan(profile, mailboxes);
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
  if (profile.importIntent && profile.importIntent !== "none")
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

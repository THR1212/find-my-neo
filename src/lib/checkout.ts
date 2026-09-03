/**
 * In-app checkout payload. Prices come from plans.json — never from a model.
 *
 * The reveal already ran `recommend()`. This file only restates that recommendation
 * in the shape Neo's own checkout shows: yearly prepaid total, the listed mailboxes
 * on the chosen domain, and an AI-site line that is free in beta when a site is
 * part of the order.
 */

import plansData from "../data/plans.json";
import type { Recommendation } from "./rules";
import type { Mailbox } from "./session";

export const CHECKOUT_ACCOUNT = { name: "Moin F", initial: "M" } as const;

export type CheckoutCycle = "monthly" | "yearly";

export interface CheckoutMailbox {
  local: string;
  address: string;
  admin: boolean;
}

/**
 * What the Claim CTA carries into checkout. No prices are stored — the screen
 * reads them from plans.json so a stale snapshot cannot disagree with the sheet.
 */
export interface CheckoutOrder {
  domain: string;
  mailboxes: CheckoutMailbox[];
  mailPlanId: string;
  mailPlanName: string;
  sitePlanId: string | null;
  sitePlanName: string | null;
  /** Email+site path. Drives the AI site / FREE BETA line — not a "we published it" flag. */
  hasSite: boolean;
  /** Mailbox count the reveal already priced. May be higher than the named addresses. */
  pricedMailboxes: number;
}

interface MailPlanJson {
  id: string;
  name: string;
  inr: Partial<Record<CheckoutCycle, number | null>>;
}

const MAIL = plansData.mail.plans as MailPlanJson[];

export function mailPlanFromSheet(id: string): MailPlanJson | null {
  return MAIL.find((p) => p.id === id) ?? null;
}

export function businessMailLabel(planName: string): string {
  const short = planName.replace(/^Neo\s+/i, "").trim() || planName;
  return `Business Mail (${short} plan)`;
}

/**
 * Neo's own checkout paints USD. Max is taken from their live checkout
 * ($9.99 / $7.99 per mailbox): two boxes yearly is $191.76, SAVE 20%, $48.
 * Other tiers stay converted from the INR sheet so we do not invent a catalog.
 */
const INR_PER_USD = 75;
const NEO_USD: Partial<Record<string, { monthly: number; yearly: number }>> = {
  max: { monthly: 9.99, yearly: 7.99 },
};

function usdFromInr(inr: number): number {
  return Math.round((inr / INR_PER_USD) * 100) / 100;
}

function usdPerMailbox(planId: string, cycle: CheckoutCycle, inr: number): number {
  const listed = NEO_USD[planId]?.[cycle];
  return listed ?? usdFromInr(inr);
}

export function formatUsd(amount: number): string {
  if (amount === 0) return "$0";
  return `$${amount.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export interface CycleTotals {
  /** Amount due now, in INR. Null if the sheet has no figure. */
  amountDueInr: number | null;
  savedInr: number;
  savePercent: number;
  /** Rounded per-mailbox USD, then multiplied — Max × 2 yearly is $191.76. */
  amountDueUsd: number | null;
  savedUsd: number;
}

/**
 * Yearly is prepaid for 12 months at the yearly per-month rate.
 * Monthly is one month at the monthly rate.
 * Site is not added: the checkout shows AI site as FREE BETA when present.
 */
export function totalsForCycle(
  mailPlanId: string,
  pricedMailboxes: number,
  cycle: CheckoutCycle,
): CycleTotals {
  const plan = mailPlanFromSheet(mailPlanId);
  const boxes = Math.max(1, pricedMailboxes);
  const monthly = plan?.inr.monthly ?? null;
  const yearly = plan?.inr.yearly ?? monthly;

  if (cycle === "yearly") {
    if (yearly == null) {
      return { amountDueInr: null, savedInr: 0, savePercent: 0, amountDueUsd: null, savedUsd: 0 };
    }
    const amountDueInr = yearly * boxes * 12;
    const yearlyUsd = usdPerMailbox(mailPlanId, "yearly", yearly);
    const amountDueUsd = yearlyUsd * boxes * 12;
    if (monthly == null || monthly <= yearly) {
      return { amountDueInr, savedInr: 0, savePercent: 0, amountDueUsd, savedUsd: 0 };
    }
    const savedInr = (monthly - yearly) * boxes * 12;
    const monthlyUsd = usdPerMailbox(mailPlanId, "monthly", monthly);
    const savedUsd = Math.round((monthlyUsd - yearlyUsd) * boxes * 12 * 100) / 100;
    const savePercent = Math.round((1 - yearlyUsd / monthlyUsd) * 100);
    return { amountDueInr, savedInr, savePercent, amountDueUsd, savedUsd };
  }

  if (monthly == null) {
    return { amountDueInr: null, savedInr: 0, savePercent: 0, amountDueUsd: null, savedUsd: 0 };
  }
  return {
    amountDueInr: monthly * boxes,
    savedInr: 0,
    savePercent: 0,
    amountDueUsd: usdPerMailbox(mailPlanId, "monthly", monthly) * boxes,
    savedUsd: 0,
  };
}

export function orderIsReady(order: CheckoutOrder | null | undefined): order is CheckoutOrder {
  if (!order) return false;
  if (!order.domain.trim()) return false;
  if (!mailPlanFromSheet(order.mailPlanId)) return false;
  if (order.mailboxes.length === 0) return false;
  return true;
}

export function adminMailbox(order: CheckoutOrder): CheckoutMailbox {
  return order.mailboxes.find((m) => m.admin) ?? order.mailboxes[0];
}

export function buildCheckoutOrder({
  domain,
  revealMailboxes,
  rec,
  hasSite,
}: {
  domain: string;
  revealMailboxes: Mailbox[];
  rec: Recommendation;
  hasSite: boolean;
}): CheckoutOrder {
  const host = domain.trim().toLowerCase();
  const locals = revealMailboxes
    .map((m) => (m.address.split("@")[0] || "").toLowerCase())
    .filter(Boolean);
  /* Neo's checkout lists the admin mailbox first (orders), then hello with a trash. */
  const ordered = [...locals].sort((a, b) => {
    if (a === "orders") return -1;
    if (b === "orders") return 1;
    if (a === "hello") return -1;
    if (b === "hello") return 1;
    return 0;
  });
  const mailboxes = (ordered.length ? ordered : ["hello"]).map((local, i) => ({
    local,
    address: host ? `${local}@${host}` : local,
    admin: i === 0,
  }));

  return {
    domain: host,
    mailboxes,
    mailPlanId: rec.mailPlan.id,
    mailPlanName: rec.mailPlan.name,
    sitePlanId: rec.sitePlan?.id ?? null,
    sitePlanName: rec.sitePlan?.name ?? null,
    hasSite,
    pricedMailboxes: rec.mailboxes,
  };
}

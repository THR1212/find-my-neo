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
 * Neo's own checkout paints USD. The sheet we price from is INR.
 * 75 is the rate that makes Max × 2 mailboxes × 12 months land on the $191.xx
 * the live checkout shows — not a second price list.
 */
const INR_PER_USD = 75;

export function formatCheckoutAmount(amountInr: number): string {
  const usd = amountInr / INR_PER_USD;
  return `$${usd.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export interface CycleTotals {
  /** Amount due now, in INR. Null if the sheet has no figure. */
  amountDueInr: number | null;
  savedInr: number;
  savePercent: number;
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
    if (yearly == null) return { amountDueInr: null, savedInr: 0, savePercent: 0 };
    const amountDueInr = yearly * boxes * 12;
    if (monthly == null || monthly <= yearly) {
      return { amountDueInr, savedInr: 0, savePercent: 0 };
    }
    const savedInr = (monthly - yearly) * boxes * 12;
    const savePercent = Math.round((1 - yearly / monthly) * 100);
    return { amountDueInr, savedInr, savePercent };
  }

  if (monthly == null) return { amountDueInr: null, savedInr: 0, savePercent: 0 };
  return { amountDueInr: monthly * boxes, savedInr: 0, savePercent: 0 };
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
  const mailboxes = revealMailboxes.map((m, i) => {
    const local = (m.address.split("@")[0] || "hello").toLowerCase();
    return {
      local,
      address: host ? `${local}@${host}` : local,
      admin: i === 0,
    };
  });

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

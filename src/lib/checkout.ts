/**
 * In-app checkout payload. Prices come from plans.json — never from a model.
 *
 * The reveal already ran `recommend()`. This file only restates that recommendation
 * in the shape Neo's own checkout shows: yearly prepaid total, the listed mailboxes
 * on the chosen domain, and an AI-site line that is free in beta when a site is
 * part of the order.
 */

import plansData from "../data/plans.json";
import { isCoSite } from "./domains";
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

/** Whole rupees from the sheet — no .00. */
export function formatInr(amount: number): string {
  if (amount === 0) return "₹0";
  return `₹${amount.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

export function domainRetailInrPerMonth(): number {
  return plansData.domain.retailInrPerMonth;
}

/** Sheet retail × 12. Yearly after-first-year figure for the Domain line. */
export function domainRetailYearlyInr(): number {
  return domainRetailInrPerMonth() * 12;
}

export function domainAfterFirstCopy(cycle: CheckoutCycle): string {
  if (cycle === "yearly") {
    return `${formatInr(domainRetailYearlyInr())}/yr after 1st year`;
  }
  return `${formatInr(domainRetailInrPerMonth())}/mo after 1st month`;
}

export function domainFreePromo(cycle: CheckoutCycle): string {
  return cycle === "yearly" ? "FREE FOR 1ST YEAR" : "FREE FOR 1ST MONTH";
}

export interface CycleTotals {
  /** Amount due now, in INR. Null if the sheet has no figure. */
  amountDueInr: number | null;
  savedInr: number;
  savePercent: number;
}

export const EMPTY_TOTALS: CycleTotals = {
  amountDueInr: null,
  savedInr: 0,
  savePercent: 0,
};

/**
 * Yearly is prepaid for 12 months at the yearly per-month rate.
 * Monthly is one month at the monthly rate.
 * Site is not added: the checkout shows AI site as FREE BETA when present.
 * SAVE % is INR mailbox rates (Max 599 vs 799), not a converted USD figure.
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
    if (yearly == null) return { ...EMPTY_TOTALS };
    const amountDueInr = yearly * boxes * 12;
    if (monthly == null || monthly <= yearly) {
      return { amountDueInr, savedInr: 0, savePercent: 0 };
    }
    const savedInr = (monthly - yearly) * boxes * 12;
    const savePercent = Math.round((1 - yearly / monthly) * 100);
    return { amountDueInr, savedInr, savePercent };
  }

  if (monthly == null) return { ...EMPTY_TOTALS };
  return {
    amountDueInr: monthly * boxes,
    savedInr: 0,
    savePercent: 0,
  };
}

/**
 * Checkout amounts as painted. Mail due is unchanged. On yearly `.co.site`, YOU SAVED
 * adds the first-year domain retail (the Domain line is ₹0 now). Custom domains do not.
 */
export function checkoutViewTotals(order: CheckoutOrder, cycle: CheckoutCycle): CycleTotals {
  const mail = totalsForCycle(order.mailPlanId, order.pricedMailboxes, cycle);
  if (cycle !== "yearly" || !isCoSite(order.domain)) return mail;
  return { ...mail, savedInr: mail.savedInr + domainRetailYearlyInr() };
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

/**
 * In-app checkout payload. Mail and site prices come from plans.json — never from a model.
 *
 * The reveal already ran `recommend()`. This file restates that recommendation as line items
 * Neo's checkout can paint: mail (per mailbox), site from `plans.site.live` (not v3Freemium),
 * and a domain row that is either the `.co.site` first-cycle promo (₹0) or Reveal's DomScan
 * yearly figure. Custom-domain INR is the one number stored on the order, because it is not
 * on the sheet.
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
 * What the Claim CTA carries into checkout.
 *
 * Mail/site INR is read from plans.json at paint time so a stale snapshot cannot disagree
 * with the sheet. `customDomainYearlyInr` is the exception: DomScan's yearly figure from
 * Reveal, or null when unknown / `.co.site` (promo path — do not store a made-up price).
 */
export interface CheckoutOrder {
  domain: string;
  mailboxes: CheckoutMailbox[];
  mailPlanId: string;
  mailPlanName: string;
  sitePlanId: string | null;
  sitePlanName: string | null;
  /** Email+site path. Drives the site line — not a "we published it" flag. */
  hasSite: boolean;
  /** Mailbox count the reveal already priced. May be higher than the named addresses. */
  pricedMailboxes: number;
  /**
   * DomScan yearly INR for a custom domain (same figure Reveal shows with ~).
   * Null if unknown, missing on an old snapshot, or `.co.site` (use the sheet promo).
   */
  customDomainYearlyInr: number | null;
}

interface MailPlanJson {
  id: string;
  name: string;
  inr: Partial<Record<CheckoutCycle, number | null>>;
}

interface SitePlanJson {
  id: string;
  name: string;
  inr: Partial<Record<CheckoutCycle, number>>;
}

const MAIL = plansData.mail.plans as MailPlanJson[];
/* `live` deliberately, not `v3Freemium` — live is what neo.space shows today. */
const SITE = plansData.site.live as SitePlanJson[];

export function mailPlanFromSheet(id: string): MailPlanJson | null {
  return MAIL.find((p) => p.id === id) ?? null;
}

export function sitePlanFromLive(id: string): SitePlanJson | null {
  return SITE.find((p) => p.id === id) ?? null;
}

export function businessMailLabel(planName: string): string {
  const short = planName.replace(/^Neo\s+/i, "").trim() || planName;
  return `Business Mail (${short} plan)`;
}

export function siteLineTitle(planName: string): string {
  return `${planName} site`;
}

/** Whole rupees from the sheet — no .00. */
export function formatInr(amount: number): string {
  if (amount === 0) return "₹0";
  return `₹${amount.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

/** DomScan domain line only — tilde matches Reveal. Never use on Amount due / Pay. */
export function formatApproxInr(amount: number): string {
  return `~${formatInr(amount)}`;
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

export type CheckoutLineKind = "mail" | "site" | "domain";

export interface CheckoutLine {
  kind: CheckoutLineKind;
  title: string;
  host?: string;
  due: number | null;
  /** True only for a custom DomScan domain — paint `~₹`. */
  approx?: boolean;
  promo?: string;
  afterCopy?: string;
}

export interface CycleTotals {
  mailDue: number | null;
  siteDue: number | null;
  domainDue: number | null;
  /** Sum of known dues. Null if the mail sheet figure is missing — do not guess a total. */
  amountDueInr: number | null;
  savedInr: number;
  savePercent: number;
  lines: CheckoutLine[];
}

export const EMPTY_TOTALS: CycleTotals = {
  mailDue: null,
  siteDue: null,
  domainDue: null,
  amountDueInr: null,
  savedInr: 0,
  savePercent: 0,
  lines: [],
};

function mailUnits(id: string): { monthly: number | null; yearly: number | null } {
  const plan = mailPlanFromSheet(id);
  const monthly = plan?.inr.monthly ?? null;
  const yearly = plan?.inr.yearly ?? monthly;
  return { monthly, yearly };
}

function siteUnits(id: string | null): {
  name: string;
  monthly: number | null;
  yearly: number | null;
} | null {
  if (!id) return null;
  const plan = sitePlanFromLive(id);
  if (!plan) return null;
  return {
    name: plan.name,
    monthly: plan.inr.monthly ?? null,
    yearly: plan.inr.yearly ?? null,
  };
}

function customDomainYearly(order: CheckoutOrder): number | null {
  const n = order.customDomainYearlyInr;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

/**
 * Old snapshots (and any Claim payload written before this field) omit
 * `customDomainYearlyInr`. Missing is unknown, not free — store null.
 */
export function normalizeCheckoutOrder(order: CheckoutOrder): CheckoutOrder {
  return { ...order, customDomainYearlyInr: customDomainYearly(order) };
}

/**
 * Mail / site / domain dues for one billing cycle, plus YOU SAVED / SAVE %.
 *
 * Amount due now is the sum of lines due now. Mail due is mail-only — never the cart total.
 *
 * SAVE % uses combined mail+site yearly vs monthly *rates* (per month on the sheet). The
 * `.co.site` first-year domain retail (₹900) sits in `savedInr` so YOU SAVED can show the
 * promo, but it is kept out of the percentage so a subdomain gift does not inflate SAVE %.
 */
export function checkoutViewTotals(order: CheckoutOrder, cycle: CheckoutCycle): CycleTotals {
  const boxes = Math.max(1, order.pricedMailboxes);
  const mail = mailUnits(order.mailPlanId);
  const site =
    order.hasSite ? siteUnits(order.sitePlanId) : null;
  const promoDomain = isCoSite(order.domain);
  const customYearly = promoDomain ? null : customDomainYearly(order);

  const mailDue =
    cycle === "yearly"
      ? mail.yearly == null
        ? null
        : mail.yearly * boxes * 12
      : mail.monthly == null
        ? null
        : mail.monthly * boxes;

  let siteDue: number | null = null;
  if (site) {
    if (cycle === "yearly" && site.yearly != null) siteDue = site.yearly * 12;
    else if (cycle === "monthly" && site.monthly != null) siteDue = site.monthly;
  }

  let domainDue: number | null = null;
  if (promoDomain) {
    domainDue = 0;
  } else if (customYearly != null) {
    domainDue = cycle === "yearly" ? customYearly : Math.round(customYearly / 12);
  }

  const amountDueInr =
    mailDue == null ? null : mailDue + (siteDue ?? 0) + (domainDue ?? 0);

  const lines: CheckoutLine[] = [
    {
      kind: "mail",
      title: businessMailLabel(order.mailPlanName),
      due: mailDue,
    },
  ];
  if (domainDue != null) {
    if (promoDomain) {
      lines.push({
        kind: "domain",
        title: "Domain",
        host: order.domain,
        due: domainDue,
        promo: domainFreePromo(cycle),
        afterCopy: domainAfterFirstCopy(cycle),
      });
    } else {
      lines.push({
        kind: "domain",
        title: "Domain",
        host: order.domain,
        due: domainDue,
        approx: true,
      });
    }
  }
  if (site && siteDue != null) {
    lines.push({
      kind: "site",
      title: siteLineTitle(order.sitePlanName ?? site.name),
      host: order.domain,
      due: siteDue,
    });
  }

  if (cycle !== "yearly") {
    return {
      mailDue,
      siteDue,
      domainDue,
      amountDueInr,
      savedInr: 0,
      savePercent: 0,
      lines,
    };
  }

  const mailSaved =
    mail.monthly != null && mail.yearly != null && mail.monthly > mail.yearly
      ? (mail.monthly - mail.yearly) * boxes * 12
      : 0;
  const siteSaved =
    site && site.monthly != null && site.yearly != null && site.monthly > site.yearly
      ? (site.monthly - site.yearly) * 12
      : 0;
  const domainSaved = promoDomain ? domainRetailYearlyInr() : 0;
  const savedInr = mailSaved + siteSaved + domainSaved;

  const yearlyRate =
    mail.yearly == null ? null : mail.yearly * boxes + (site?.yearly ?? 0);
  const monthlyRate =
    mail.monthly == null ? null : mail.monthly * boxes + (site?.monthly ?? 0);
  const savePercent =
    yearlyRate != null && monthlyRate != null && monthlyRate > 0 && yearlyRate < monthlyRate
      ? Math.round((1 - yearlyRate / monthlyRate) * 100)
      : 0;

  return {
    mailDue,
    siteDue,
    domainDue,
    amountDueInr,
    savedInr,
    savePercent,
    lines,
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
  domainPriceInr = null,
  domainFree = false,
}: {
  domain: string;
  revealMailboxes: Mailbox[];
  rec: Recommendation;
  hasSite: boolean;
  /** DomScan yearly from Reveal (`live[domain.name]?.priceInr ?? domain.priceInr`). */
  domainPriceInr?: number | null;
  /** Reveal's `domain.free` — `.co.site` promo path, ignore any lookup figure. */
  domainFree?: boolean;
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

  const promoDomain = domainFree || isCoSite(host);
  const customDomainYearlyInr =
    promoDomain || typeof domainPriceInr !== "number" || !Number.isFinite(domainPriceInr)
      ? null
      : domainPriceInr;

  return {
    domain: host,
    mailboxes,
    mailPlanId: rec.mailPlan.id,
    mailPlanName: rec.mailPlan.name,
    sitePlanId: rec.sitePlan?.id ?? null,
    sitePlanName: rec.sitePlan?.name ?? null,
    hasSite,
    pricedMailboxes: rec.mailboxes,
    customDomainYearlyInr,
  };
}

function sampleOrder(partial: Partial<CheckoutOrder>): CheckoutOrder {
  return {
    domain: "example.com",
    mailboxes: [{ local: "hello", address: "hello@example.com", admin: true }],
    mailPlanId: "max",
    mailPlanName: "Neo Max",
    sitePlanId: null,
    sitePlanName: null,
    hasSite: false,
    pricedMailboxes: 2,
    customDomainYearlyInr: null,
    ...partial,
  };
}

function demand(label: string, got: unknown, want: unknown): void {
  if (got !== want) {
    throw new Error(`checkout cart ${label}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
  }
}

/**
 * The four carts (plus Starter and the monthly toggle) against the current sheet.
 * Run from `src/lib/checkoutCarts.check.ts`. Throws on the first mismatch.
 */
export function assertCheckoutCarts(): void {
  const maxPlus = sampleOrder({
    hasSite: true,
    sitePlanId: "plus",
    sitePlanName: "Plus",
    pricedMailboxes: 2,
    mailPlanId: "max",
    mailPlanName: "Neo Max",
  });

  const mailOnly = checkoutViewTotals(
    sampleOrder({ mailPlanId: "max", pricedMailboxes: 2, hasSite: false, customDomainYearlyInr: null }),
    "yearly",
  );
  demand("mail-only due", mailOnly.amountDueInr, 14_376);
  demand("mail-only mailDue", mailOnly.mailDue, 14_376);
  demand("mail-only no site", mailOnly.siteDue, null);
  demand("mail-only no domain", mailOnly.domainDue, null);
  demand("mail-only site line", mailOnly.lines.some((l) => l.kind === "site"), false);
  demand("mail-only domain line", mailOnly.lines.some((l) => l.kind === "domain"), false);

  const withSite = checkoutViewTotals(maxPlus, "yearly");
  demand("mail+site due", withSite.amountDueInr, 18_684);
  demand("mail+site mailDue stays mail", withSite.mailDue, 14_376);
  demand("mail+site siteDue", withSite.siteDue, 4_308);
  demand("mail+site site title", withSite.lines.find((l) => l.kind === "site")?.title, "Plus site");
  demand("mail+site no domain", withSite.domainDue, null);

  const coSite = checkoutViewTotals(
    { ...maxPlus, domain: "fruitwala.co.site", customDomainYearlyInr: null },
    "yearly",
  );
  demand("co.site due (domain ₹0)", coSite.amountDueInr, 18_684);
  demand("co.site domainDue", coSite.domainDue, 0);
  demand("co.site saved", coSite.savedInr, 8_580);
  demand("co.site site still charged", coSite.siteDue, 4_308);

  const custom = checkoutViewTotals({ ...maxPlus, customDomainYearlyInr: 1_050 }, "yearly");
  demand("custom due", custom.amountDueInr, 19_734);
  demand("custom domainDue", custom.domainDue, 1_050);
  demand("custom domain approx", custom.lines.find((l) => l.kind === "domain")?.approx, true);
  demand("custom mailDue not the total", custom.mailDue, 14_376);

  const starter = checkoutViewTotals(
    sampleOrder({
      mailPlanId: "starter",
      mailPlanName: "Neo Starter",
      pricedMailboxes: 1,
      hasSite: false,
    }),
    "yearly",
  );
  demand("starter×1 yearly", starter.amountDueInr, 1_788);
  demand("starter mailDue", starter.mailDue, 1_788);

  const monthly = checkoutViewTotals(maxPlus, "monthly");
  demand("monthly Max×2+Plus", monthly.amountDueInr, 2_197);
  demand("monthly mailDue", monthly.mailDue, 1_598);
  demand("monthly siteDue", monthly.siteDue, 599);
  demand("monthly no YOU SAVED figure", monthly.savedInr, 0);

  const missingSiteId = checkoutViewTotals(
    sampleOrder({ hasSite: true, sitePlanId: null, sitePlanName: null, pricedMailboxes: 2 }),
    "yearly",
  );
  demand("hasSite without plan id omits site", missingSiteId.siteDue, null);
  demand("hasSite without plan id no site line", missingSiteId.lines.some((l) => l.kind === "site"), false);

  const rec = {
    mailPlan: mailPlanFromSheet("max")!,
    sitePlan: sitePlanFromLive("plus"),
    mailboxes: 2,
  } as Recommendation;
  const builtCustom = buildCheckoutOrder({
    domain: "fruitwala.com",
    revealMailboxes: [{ address: "hello@fruitwala.com", label: "hello" }],
    rec,
    hasSite: true,
    domainPriceInr: 1_050,
  });
  demand("Claim passes DomScan yearly", builtCustom.customDomainYearlyInr, 1_050);

  const builtCo = buildCheckoutOrder({
    domain: "fruitwala.co.site",
    revealMailboxes: [{ address: "hello@fruitwala.co.site", label: "hello" }],
    rec,
    hasSite: true,
    domainPriceInr: 1_050,
    domainFree: true,
  });
  demand(".co.site stores null not DomScan", builtCo.customDomainYearlyInr, null);

  const builtUnknown = buildCheckoutOrder({
    domain: "fruitwala.in",
    revealMailboxes: [{ address: "hello@fruitwala.in", label: "hello" }],
    rec,
    hasSite: false,
    domainPriceInr: null,
  });
  demand("unknown custom domain is null", builtUnknown.customDomainYearlyInr, null);
  demand(
    "unknown custom omits Domain row",
    checkoutViewTotals(builtUnknown, "yearly").domainDue,
    null,
  );

  const normalized = normalizeCheckoutOrder({
    ...maxPlus,
    customDomainYearlyInr: undefined as unknown as number | null,
  });
  demand("missing field → null", normalized.customDomainYearlyInr, null);
}

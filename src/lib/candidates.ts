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
import { has, type Profile } from "./engine";

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
    when: (p) => has(p, "sellsOnline", true),
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

  const candidate = viable[0] ?? { mail: "starter", site: "none" };

  /* Only the needs that actually forced this candidate above the floor of its dimension —
     a need satisfied by the baseline anyway explains nothing and would pad the reveal. */
  const binding = needs.filter(
    (n) =>
      (n.minMail && MAIL_RANK[n.minMail] > 0) || (n.minSite && SITE_RANK[n.minSite] > 0),
  );

  return { candidate, binding, viable };
}

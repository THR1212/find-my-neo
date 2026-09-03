/**
 * Feature highlighting.
 *
 * Once we've recommended a plan, we say WHY — one or two real Neo features this particular
 * person will actually use, tied to something they told us. "Read receipts" means nothing in
 * the abstract; "so you know whether the quote was opened" lands, because they just told us
 * they send quotes.
 *
 * ┌──────────────────────────────────────────────────────────────────────────────────┐
 * │ THE MODEL DOES NOT CHOOSE THESE, AND MUST NEVER WRITE THEM.                       │
 * │ Matching is deterministic — see pickFeatures(). A hallucinated Neo feature in     │
 * │ front of the Neo product team is the worst failure this demo could have.          │
 * │                                                                                   │
 * │ NAMES ARE NEO'S OWN, VERBATIM, from their plan feature catalogue:                 │
 * │   https://static.flock.co/meta/plan/feature/config/en-US.json                     │
 * │ (public, no auth; captured from the live checkout flow 28 Aug 2026 — 49 features) │
 * │                                                                                   │
 * │ The `id` on each entry is Neo's own key in that file. BEFORE ADDING A FEATURE:    │
 * │ find its key there and copy the `heading` exactly. Do not invent a snappier name  │
 * │ — the point is that a Neo PM can look it up.                                      │
 * └──────────────────────────────────────────────────────────────────────────────────┘
 *
 * Corrections this catalogue forced on an earlier hand-written version — the reason
 * "check the source" is a rule here and not a suggestion:
 *   "AI Smart Write"   -> actually **AI Email Writer**   (`titan_ai`)
 *   "Email Campaigns"  -> actually **Campaign Mode**     (`email_marketing`)
 *   "Email tracking"   -> actually **Read Receipts**     (`read_receipts`)
 *   "Mail and contact import" -> **One-click import of existing emails & contacts**
 *
 * Also settled by the catalogue:
 *   `neo_domain`   = "maxdesigns.co.site domain"  -> the FREE .co.site subdomain
 *   `custom_domain`= "Custom Domain Email"        -> a domain you ALREADY OWN (bring your own)
 *   `neo_site`     = "AI-powered site builder"    -> one-page (asset is one_page_site.png)
 */

import { has, type Profile } from "./engine";

export type FeatureSurface = "mail" | "site";

export interface Feature {
  /** Neo's own key in their feature catalogue. Traceable on purpose. */
  id: string;
  /** Neo's own `heading`, verbatim. Do not reword. */
  name: string;
  surface: FeatureSurface;
  /**
   * Why THIS person cares. Ours to write — it is the personalisation, and the only part of
   * the line that isn't Neo's copy. Keep it concrete and tied to a signal they gave us;
   * generic benefit copy is exactly what we're trying to beat.
   */
  because: string;
  /** True when this person's profile makes the feature genuinely relevant. */
  matches: (p: Profile) => boolean;
  /** Tie-break when several match. Higher wins. */
  priority: number;
}

/* Delegates to engine.has() because a profile value may be an ARRAY once the question is
   multi-select. A direct `p[k] === v` silently stops matching and nothing tells you. */
const is = (p: Profile, k: string, v: unknown) => has(p, k, v);

export const FEATURES: Feature[] = [
  {
    id: "import_email_contacts",
    name: "One-click import of existing emails & contacts",
    surface: "mail",
    because: "your existing mail comes across, so nothing is lost in the move",
    matches: (p) => p.importIntent !== undefined && !is(p, "importIntent", "none"),
    priority: 10,
  },
  {
    id: "multi_device_support",
    name: "Multi-account Support",
    surface: "mail",
    /* Neo's own description literally cites sales@ and info@ — exactly the shape of the
       hello@/orders@ split we put on the reveal. */
    because: "so orders@ and hello@ can live apart instead of in one personal inbox",
    /* Either count qualifies: two mailboxes is the trigger whether that's two people or
       one person running hello@ alongside their own name. mailboxCount is what the question
       now asks; teamSize is the model's headcount read and only stands in without it. */
    matches: (p) =>
      is(p, "customerChannel", "social") || Number(p.mailboxCount ?? p.teamSize ?? 0) >= 2,
    priority: 9,
  },
  {
    id: "read_receipts",
    name: "Read Receipts",
    surface: "mail",
    because: "you can tell whether a quote was actually opened",
    matches: (p) => is(p, "sellsOnline", false) || is(p, "customerChannel", "personal_email"),
    priority: 8,
  },
  {
    id: "invoice_builder",
    name: "Invoice Builder",
    surface: "mail",
    because: "quotes and invoices without leaving your inbox",
    matches: (p) => is(p, "sellsOnline", true),
    priority: 8,
  },
  {
    id: "titan_ai",
    name: "AI Email Writer",
    surface: "mail",
    because: "replies to the same three questions stop eating your evenings",
    matches: (p) =>
      is(p, "customerChannel", "social") || is(p, "customerChannel", "personal_email"),
    priority: 6,
  },
  {
    id: "email_marketing",
    name: "Campaign Mode",
    surface: "mail",
    because: "tell past customers what's new without doing it one message at a time",
    matches: (p) => is(p, "sellsOnline", true),
    priority: 6,
  },
  {
    id: "gmail_sync",
    name: "Add Gmail Account",
    surface: "mail",
    because: "keep reading your old Gmail in the same place while you switch over",
    matches: (p) => is(p, "currentClient", "gmail"),
    priority: 7,
  },
  {
    id: "imap_pop",
    name: "Third-party mail app (POP/IMAP)",
    surface: "mail",
    because: "carry on using Outlook if you'd rather not change habits",
    matches: (p) => is(p, "currentClient", "outlook") || is(p, "currentClient", "apple"),
    priority: 7,
  },
  {
    id: "signature_builder",
    name: "Signature Designer",
    surface: "mail",
    because: "every mail you send looks like it came from a real business",
    matches: (p) => is(p, "customerChannel", "personal_email"),
    priority: 4,
  },

  /* --- Site ---
   *
   * SOURCE IS DIFFERENT FROM THE MAIL HALF ABOVE, and that matters when you add one.
   *
   * Mail features come from Neo's JSON config (the 49-entry file named at the top of this
   * file), so their names are the API's own `heading` verbatim. **There is no equivalent
   * config for site features** — three plausible paths were probed and all 403'd, and the
   * pricing page fetches no second config. Neo's site features exist only as static markup in
   * their pricing page's "AI Site Pricing" comparison table.
   *
   * That table is captured in `src/data/site-features.json` with its read date. Names below
   * are its verbatim `feature-name` cells. Before adding one, check it there — and re-read the
   * live page if you are about to quote a limit to anyone at Neo, because a marketing page
   * changes without warning.
   *
   * There used to be three entries here and two of them were `matches: () => true`, so every
   * site recommendation on earth showed the same bullets. That is the "the reveal is
   * templated" complaint in its purest form: personalised copy sitting on top of a feature
   * set that never varied.
   */
  {
    id: "site_contact_forms",
    name: "Contact Forms",
    surface: "site",
    /* THE most important row in Neo's site table: Basic has none at all (Plus 1000, Growth
       unlimited). See rules.ts — this is why an enquiry-led business cannot be sent to Basic. */
    because: "enquiries land in your inbox instead of a DM you'll scroll past",
    matches: (p) =>
      is(p, "sellsOnline", false) ||
      is(p, "customerChannel", "social") ||
      is(p, "customerChannel", "personal_email"),
    priority: 10,
  },
  {
    id: "site_products",
    name: "List your products",
    surface: "site",
    because: "your products on a page you can send someone, priced and in one place",
    matches: (p) => is(p, "sellsOnline", true),
    priority: 9,
  },
  {
    id: "site_services",
    name: "List your services",
    surface: "site",
    because: "what you do and what it costs, without retyping it into every message",
    matches: (p) => is(p, "sellsOnline", false) && !is(p, "customerChannel", "offline"),
    priority: 8,
  },
  {
    id: "appointment_booking",
    name: "Appointment Booking",
    surface: "site",
    because: "people pick a slot themselves instead of messaging back and forth",
    matches: (p) => is(p, "sellsOnline", false) || is(p, "customerChannel", "offline"),
    priority: 8,
  },
  {
    id: "site_whatsapp",
    name: "WhatsApp",
    surface: "site",
    /* Plus and above. Neo's own generated sites carry a WhatsApp widget — observed in a real
       run, see docs/neo-product-facts.md — so this is a fact about the product, not a claim. */
    because: "the chat button your customers already expect, on the site itself",
    matches: (p) => is(p, "customerChannel", "social"),
    priority: 7,
  },
  {
    id: "site_testimonials",
    name: "Testimonials",
    surface: "site",
    because: "the word-of-mouth you already have, where a stranger can read it",
    matches: (p) => is(p, "customerChannel", "offline") || is(p, "customerChannel", "personal_email"),
    priority: 6,
  },
  {
    id: "site_analytics",
    name: "Visitor analytics",
    surface: "site",
    /* On every site plan including Basic — safe to show to anyone with a site. */
    because: "you find out whether anyone actually came, not just that it's live",
    matches: (p) => is(p, "customerChannel", "site"),
    priority: 5,
  },
  {
    id: "site_branding",
    name: "Remove Neo Branding",
    surface: "site",
    /* Absent on Basic. Only worth surfacing to someone already heading for Plus. */
    because: "the page reads as yours, with nobody else's name in the footer",
    matches: (p) => is(p, "sellsOnline", true) || is(p, "customerChannel", "site"),
    priority: 4,
  },
  {
    id: "neo_site",
    name: "AI-powered site builder",
    surface: "site",
    /* One page — Neo's own asset for this feature is one_page_site.png, and the builder's
       system prompt says "one-page landing website". Never imply multi-page. */
    because: "a one-page site generated from what you just told us, yours to edit",
    matches: (p) => is(p, "customerChannel", "social") || is(p, "surface", "both"),
    priority: 3,
  },
  {
    id: "neo_domain",
    name: "Free .co.site domain",
    surface: "site",
    /* Catalogue heading is templated ("maxdesigns.co.site domain"), so this one is
       necessarily paraphrased — but the SUBSTANCE is exact: neo_domain is the free
       .co.site subdomain, confirmed by walking the funnel.
       Last-resort fallback: matches everyone, so it must stay the lowest site priority. */
    because: "somewhere to publish today, before you commit to buying a domain",
    matches: () => true,
    priority: 1,
  },
  {
    id: "custom_domain",
    name: "Custom Domain Email",
    surface: "mail",
    because: "customers see your business name, not a generic address",
    matches: () => true,
    priority: 1,
  },
];

/**
 * Pick up to `limit` features for the surfaces in play. At most one per surface when both are
 * in play, so a mail+site recommendation justifies each half rather than stacking two reasons
 * for whichever matched hardest — the point is to explain the shape of the recommendation.
 */
export function pickFeatures(
  profile: Profile,
  surfaces: FeatureSurface[],
  limit = 2,
): Feature[] {
  const picked: Feature[] = [];

  for (const surface of surfaces) {
    const best = FEATURES.filter((f) => f.surface === surface && f.matches(profile)).sort(
      (a, b) => b.priority - a.priority,
    )[0];
    if (best) picked.push(best);
  }

  // One surface in play and room left — add its runner-up rather than padding with the other
  // surface, which they explicitly didn't ask for.
  if (picked.length < limit && surfaces.length === 1) {
    const more = FEATURES.filter(
      (f) => f.surface === surfaces[0] && f.matches(profile) && !picked.includes(f),
    ).sort((a, b) => b.priority - a.priority);
    picked.push(...more.slice(0, limit - picked.length));
  }

  return picked.slice(0, limit);
}

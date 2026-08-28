/**
 * Handoff into Neo's real purchase funnel.
 *
 * The original brief listed the handoff encoding as "TBD — hash parameter name and signing
 * method unknown". It turns out there is no encoding: Neo passes everything as PLAIN QUERY
 * PARAMETERS. Captured from a real run on 28 Aug 2026 (see docs/neo-product-facts.md):
 *
 *   https://join.neo.space/site/domain-selection
 *     ?bn=Proof+%26+Butter
 *     &bd=<full free-text description>
 *     &industryKey=business_management_consulting
 *     &siteCategory=professional_service
 *     &templateKey=property&templateName={"key":"property","value":"Real Estate"}
 *     &hasUsedAiFlow=true&source_hook=purchaseFlow&email=...&locale=en-US&browser=true
 *
 * So our CTA can be REAL rather than a mock — we build this URL from our own profile and drop
 * the user into Neo's funnel with the business name and description already filled.
 *
 * Two things we deliberately DO NOT send:
 *  - `templateKey` / `templateName`. Neo derives the template from `industryKey`, and that is
 *    exactly the mechanism we are arguing against: a bakery came back as `fashion_store` and
 *    then `property` ("Real Estate"). Sending nothing lets Neo pick; sending a guess makes us
 *    complicit in the bug we're pointing at.
 *  - `email`. We don't collect one, and appending an address we inferred would be worse than
 *    letting Neo ask.
 *
 * SAFETY: this returns a URL for a link a person clicks. Never navigate automatically, and
 * never fire it during a rehearsal against production — see CLAUDE.md.
 */

import type { Profile } from "./engine";

/** Env-overridable so staging can be targeted without a code change. */
const BASE =
  import.meta.env.VITE_HANDOFF_BASE?.replace(/\/$/, "") ?? "https://join.neo.space";

/**
 * Neo's `industryKey` taxonomy. We only map values we have actually observed, and fall back to
 * omitting the param entirely rather than guessing — a wrong key is what produces a Real Estate
 * template for a bakery, and shipping that would undercut the whole argument.
 *
 * Extend this only with keys seen in a real Neo request.
 */
const INDUSTRY_KEYS: Record<string, string> = {
  "food & beverages": "food_and_beverages",
  "e-commerce & retail": "ecommerce_and_retail",
  "marketing & advertising": "marketing_and_advertising",
  "business & management consulting": "business_management_consulting",
  "media & entertainment": "media_and_entertainment",
  "it & web development services": "it_and_web_development_services",
  "photography & videography": "photography_and_videography",
};

function industryKeyFor(industry: unknown): string | null {
  if (typeof industry !== "string") return null;
  return INDUSTRY_KEYS[industry.trim().toLowerCase()] ?? null;
}

export interface HandoffInput {
  profile: Profile;
  /** Business name, e.g. "Proof & Butter". Neo's field caps at 55 characters. */
  businessName: string;
  /** The user's original free text. Neo's field caps at 2000 characters. */
  businessDescription: string;
}

export function buildHandoffUrl({
  profile,
  businessName,
  businessDescription,
}: HandoffInput): string {
  const params = new URLSearchParams();

  // Neo's own limits, from the spec (NP/698843154). Truncating here beats being rejected there.
  params.set("bn", businessName.slice(0, 55));
  params.set("bd", businessDescription.slice(0, 2000));

  const ik = industryKeyFor(profile.industry);
  if (ik) params.set("industryKey", ik);

  params.set("hasUsedAiFlow", "true");
  params.set("source_hook", "purchaseFlow");
  params.set("locale", "en-US");

  /* Marks the traffic as ours in Neo's analytics. The 'neotest' convention exists precisely so
     production analytics can be filtered — use it for anything that isn't a real customer. */
  params.set("utm_source", "findmyneo");
  params.set("utm_content", "neotest");

  return `${BASE}/site/domain-selection?${params.toString()}`;
}

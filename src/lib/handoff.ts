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
 *
 * WHAT WE KNOW OF THE FULL LIST (02 Sep 2026). Production's builder shows six under a heading
 * reading "POPULAR INDUSTRIES":
 *   Apparel & Fashion · E-commerce & Retail · Marketing & Advertising ·
 *   Business & Management Consulting · Media & Entertainment · IT & Web Development Services
 *
 * That is a curated shortlist, NOT the taxonomy. Proof: `food_and_beverages` and
 * `photography_and_videography` below were both captured from real Neo requests and neither
 * appears in that six. So the real list is longer and reachable some other way — a search box,
 * or a "see all". Worth capturing properly: with the complete list, `api/profile.ts` could emit
 * Neo's own category directly and TAXONOMY_TO_NEO would disappear.
 *
 * `apparel_and_fashion` is the presumed key for the one we have seen on screen but not yet in a
 * request. NOT added below, because this map's rule is observed-in-a-real-request only, and a
 * guessed key is exactly the failure mode we are arguing against.
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

/**
 * Titan's analytics taxonomy (16 industries) -> Neo's site-builder keys.
 *
 * Two different taxonomies owned by two different systems. `api/profile.ts` emits Titan's
 * because that is the one with data behind it; Neo's generator only understands its own.
 *
 * `api/profile.ts` constrains the model to Titan's 16 industries, because Neo's free-text
 * `business_industry` field has 5,318 distinct values and routes nothing. Those 16 labels are
 * not spelled the way Neo's builder spells its categories, so without this map
 * `industryKeyFor` returned null for everything the model produced and the handoff URL simply
 * never carried an `industryKey` — which is what was happening in production.
 *
 * Only meanings that actually correspond are mapped. Nine of the sixteen have no observed Neo
 * key and stay unmapped on purpose: omitting the param lets Neo pick, whereas guessing a near
 * neighbour is how a painter gets a photography template. "Arts & Creative Services" is the
 * tempting one to point at `photography_and_videography` — don't; it is a subset, not a match.
 */
const TAXONOMY_TO_NEO: Record<string, string> = {
  "food & beverage": "food_and_beverages",
  "e-commerce & retail": "ecommerce_and_retail",
  "marketing & advertising": "marketing_and_advertising",
  "professional & business services": "business_management_consulting",
  "media & entertainment": "media_and_entertainment",
  "technology & it services": "it_and_web_development_services",
};

function industryKeyFor(industry: unknown): string | null {
  if (typeof industry !== "string") return null;
  const k = industry.trim().toLowerCase();
  return INDUSTRY_KEYS[k] ?? TAXONOMY_TO_NEO[k] ?? null;
}

export interface HandoffInput {
  profile: Profile;
  /**
   * The industryKey Neo's OWN generator returned for this business.
   *
   * This is the authoritative answer and it beats anything we can derive. Neo's `t:"bi"` call
   * classifies the description itself and hands back an `industryKey` from their taxonomy —
   * so it is guaranteed to be a key their builder accepts, chosen by their own classifier.
   * We already had it on `NeoSite.industryKey` and were throwing it away while mapping our
   * way towards a guess.
   *
   * Undefined until Neo's generator lands (22-38s), so TAXONOMY_TO_NEO below is still the
   * fallback for the window before that, and for when the call degrades.
   */
  neoIndustryKey?: string | null;
  /**
   * The template THEY picked, from the two Neo generated side by side.
   *
   * This is the one param docs/neo-product-facts.md tells us not to guess, and the reason it
   * is safe to send now is that we are no longer guessing. Neo picks the template RANDOMLY
   * client-side (§ "Generate design"), and the same bakery came back `fashion_store`, then
   * `property` ("Real Estate"), then `bio_site` across three runs. The note below still holds
   * for a DERIVED key — sending our guess would make us complicit in the bug we are pointing
   * at — but a person choosing between two of Neo's own outputs is not a guess. It is the
   * answer to the complaint.
   *
   * Undefined until the generator lands and someone picks, and omitted entirely when so:
   * Neo then falls back to its own selection, which is exactly today's behaviour.
   */
  neoTemplateKey?: string | null;
  /** Business name, e.g. "Proof & Butter". Neo's field caps at 55 characters. */
  businessName: string;
  /** The user's original free text. Neo's field caps at 2000 characters. */
  businessDescription: string;
}

export function buildHandoffUrl({
  profile,
  businessName,
  businessDescription,
  neoIndustryKey,
  neoTemplateKey,
}: HandoffInput): string {
  const params = new URLSearchParams();

  // Neo's own limits, from the spec (NP/698843154). Truncating here beats being rejected there.
  params.set("bn", businessName.slice(0, 55));
  params.set("bd", businessDescription.slice(0, 2000));

  /* Neo's own classification first — see neoIndustryKey. Ours is the fallback for the window
     before their generator answers, and it stays deliberately incomplete: ten of the sixteen
     industries have no observed Neo key and send nothing rather than a near neighbour. */
  const ik = neoIndustryKey?.trim() || industryKeyFor(profile.industry);
  if (ik) params.set("industryKey", ik);

  /* `templateKey` only, never `templateName`. Neo's real URL carries both, and templateName is
     a JSON-encoded {key, value} whose VALUE is their display string — "Real Estate" for
     `property`. We have the key from their own generator; we do not have their label, and
     `templateLabel()` derives "Property", which is not the same string. A malformed
     templateName is worse than an absent one, so we send what we actually know. */
  if (neoTemplateKey) params.set("templateKey", neoTemplateKey);

  params.set("hasUsedAiFlow", "true");
  params.set("source_hook", "purchaseFlow");
  params.set("locale", "en-US");

  /* Marks the traffic as ours in Neo's analytics. The 'neotest' convention exists precisely so
     production analytics can be filtered — use it for anything that isn't a real customer. */
  params.set("utm_source", "findmyneo");
  params.set("utm_content", "neotest");

  return `${BASE}/site/domain-selection?${params.toString()}`;
}

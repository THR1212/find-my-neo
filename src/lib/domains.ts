/**
 * Client-side domain lookup. Calls OUR endpoint, never DomScan directly — the API key is
 * server-side only, so the browser must not know the provider exists.
 *
 * We previously called RDAP straight from the browser (free, keyless, CORS-open). That was
 * removed: DomScan's /v1/status is RDAP-backed anyway, costs 1 credit per request regardless
 * of how many TLDs you batch, and returns availability AND pricing through one integration.
 * Keeping two sources of truth for the same fact wasn't worth it.
 */

import { reportDegraded } from "./errorLog";

export interface DomainInfo {
  domain: string;
  tld: string;
  /** null means we genuinely don't know — render no badge rather than a wrong one. */
  available: boolean | null;
  confidence: string | null;
  /** Indicative INR/yr. NOT Neo's price — see api/_lib/domainService.ts. */
  priceInr: number | null;
  priceSource: string | null;
  /** Free for the first billing cycle. True only for `.co.site` — Neo's own namespace. */
  free?: boolean;
}

/**
 * Seven entries, but only six count against MAX_TLDS server-side — `co.site` is not a
 * registrable TLD and never reaches DomScan.
 *
 * The reveal SHOWS four: the model's three registrable suggestions plus `.co.site`. The spare
 * TLDs (net/org/shop) exist so a taken .com can be replaced by a free .net from the same batch,
 * and so a person checking a domain of their own is answered without a second status call.
 * Availability for six costs the same single credit as three (see domainService).
 *
 * Three REGISTRABLE names shown is still deliberate: more than that is a shopping list, not a
 * recommendation. `.co.site` sits outside that count — see SUGGESTED_COUNT.
 */
export const TLDS = ["com", "in", "co", "co.site", "net", "org", "shop"] as const;

/**
 * Neo's own namespace, and the only thing on the domain step Neo can actually sell today.
 * Not a registrable TLD — `api/_lib/cositeService.ts` answers for it, not DomScan, and it
 * costs no DomScan credit, so it does not count against MAX_TLDS.
 */
export const COSITE_SUFFIX = "co.site";

export const isCoSite = (name: string): boolean => name.endsWith(`.${COSITE_SUFFIX}`);

/**
 * How many names the reveal recommends. Matches the profile payload.
 *
 * Four, up from three. Three was deliberate — "more than that is a shopping list, not a
 * recommendation" — and that still holds for REGISTRABLE names, which is why the custom
 * TLDs stay at three. The fourth slot is reserved for `.co.site`, which is a different
 * kind of thing rather than one more item on a list: it is free for the first billing
 * cycle, it is Neo's own, and it is the only one of the four a person can actually buy
 * from Neo today (`docs/neo-product-facts.md`). Showing it costs no credit and removes the
 * flow's one dead end.
 */
export const SUGGESTED_COUNT = 4;

/**
 * Names to put on the reveal: never a domain DomScan said is taken.
 *
 * Preferred order (the model's three) is kept when those names are free or still unknown.
 * Taken names are dropped, and free TLDs from the same lookup fill the gaps so we still
 * recommend up to SUGGESTED_COUNT buyable names. Unknown stays until the lookup answers —
 * hiding it would empty the screen on a failed request, which is worse than a quiet first
 * paint.
 */
export function availableFromLookup(
  preferred: string[],
  live: DomainInfo[],
  max = SUGGESTED_COUNT,
): DomainInfo[] {
  const byDomain = new Map(live.map((r) => [r.domain, r]));

  const asInfo = (name: string, row?: DomainInfo): DomainInfo =>
    row ?? {
      domain: name,
      tld: name.includes(".") ? name.slice(name.indexOf(".") + 1) : "",
      available: null,
      confidence: null,
      priceInr: null,
      priceSource: null,
      /* Free-ness is a product fact, not a lookup result, so it holds on the first paint
         too — otherwise the .co.site row renders priceless and unlabelled until the check
         returns, and the one thing worth saying about it is the thing said last. */
      ...(isCoSite(name) ? { free: true } : {}),
    };

  const preferredAvailable: DomainInfo[] = [];
  const preferredUnknown: DomainInfo[] = [];
  for (const name of preferred) {
    const row = byDomain.get(name);
    if (row?.available === false) continue;
    if (row?.available === true) preferredAvailable.push(row);
    else preferredUnknown.push(asInfo(name, row));
  }

  const seen = new Set(preferredAvailable.map((r) => r.domain));
  const extras = live.filter((r) => r.available === true && !seen.has(r.domain));

  /* `.co.site` gets the LAST slot, reserved, rather than competing for a place in the ranking.
     Neither of the obvious alternatives works:

     - Ranking it with the others loses it in the common case. The fallback checker can only
       ever prove "taken" (see cositeService.ts), so a free stem comes back `available: null`
       and sorts into preferredUnknown — behind every confirmed-free .net/.org/.shop from the
       same batch. The one name Neo can actually sell today would be the one pushed off the
       end of a four-item list.
     - Ranking it FIRST hands it the hero slot whenever the lookup fails, because then
       everything is unknown and nothing outranks it. A degraded third-party call is not a
       reason to headline a free subdomain instead of the name the person came for.

     So: the three registrable slots are contested exactly as before, and `.co.site` is
     appended. If it came back taken it is absent from both preferred lists and the loop
     simply fills all four slots with registrable names.

     Reveal.tsx renders the taken case as a note rather than silence — being told the name is
     gone is useful, and unlike a custom TLD this one is gone at NEO, which the person is
     about to find out anyway. */
  const coSiteRow = [...preferredAvailable, ...preferredUnknown].find((r) => isCoSite(r.domain));
  const rest = (rows: DomainInfo[]) => rows.filter((r) => !isCoSite(r.domain));
  const registrableSlots = coSiteRow ? max - 1 : max;

  const picked: DomainInfo[] = [];
  for (const row of [...rest(preferredAvailable), ...rest(extras), ...rest(preferredUnknown)]) {
    if (picked.length >= registrableSlots) break;
    if (picked.some((p) => p.domain === row.domain)) continue;
    picked.push(row);
  }
  if (coSiteRow) picked.push(coSiteRow);
  return picked;
}

export async function lookupDomains(
  stem: string,
  tlds: readonly string[] = TLDS,
  /* 12s, not 6s. A cold lookup costs 4 DomScan credits across several upstream calls and
     measured past 6s in practice, which aborted the request and left the reveal with no
     prices and no availability. There is time to spare: the reveal is already waiting on
     Neo's 22-38s generator. */
  timeoutMs = 12000,
  /**
   * The person typed a name and pressed Check, rather than this being the reveal's own
   * batch lookup.
   *
   * Server-side this opts a `.co.site` name into Titan's Partner Panel lookup, which is the
   * only source that can currently say a name is FREE — the probe can only ever say taken.
   * Deliberately off for the batch lookup, so a page view never reaches an admin-session
   * endpoint. Not a security boundary: see handleDomainLookup.
   */
  manual = false,
): Promise<DomainInfo[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(
      `/api/domains?name=${encodeURIComponent(stem)}&tlds=${encodeURIComponent(tlds.join(","))}` +
        (manual ? "&manual=1" : ""),
      { signal: controller.signal },
    );
    if (!res.ok) {
      reportDegraded("domains http", String(res.status));
      return [];
    }
    const body = (await res.json()) as { domains?: DomainInfo[] };
    if (!body.domains?.length) reportDegraded("domains empty");
    return body.domains ?? [];
  } catch (err) {
    reportDegraded("domains unreachable", err instanceof Error ? err.message : String(err));
    // Network failure, timeout, no key configured — the reveal must still render.
    // Returning [] leaves `available` and `priceInr` null upstream, so no badge and no price
    // appear. That is the whole point: silence beats a guess someone can check instantly.
    return [];
  } finally {
    clearTimeout(timer);
  }
}

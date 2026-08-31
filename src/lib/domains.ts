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
}

/** Matches MAX_TLDS server-side. Three alternates is a recommendation; more is a shopping list. */
export const TLDS = ["com", "in", "co"] as const;

export async function lookupDomains(
  stem: string,
  tlds: readonly string[] = TLDS,
  timeoutMs = 6000,
): Promise<DomainInfo[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(
      `/api/domains?name=${encodeURIComponent(stem)}&tlds=${encodeURIComponent(tlds.join(","))}`,
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
    // It falls back to the fixture's domains with no availability badge.
    return [];
  } finally {
    clearTimeout(timer);
  }
}

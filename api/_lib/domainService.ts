/**
 * Domain availability + pricing, via DomScan.
 *
 * Lives server-side because DOMSCAN_API_KEY must never reach the browser. The same handler
 * is mounted twice — as a Vite dev middleware (local `npm run dev`) and as a Vercel function
 * (deployed) — so there is one implementation and no "works locally, breaks in prod".
 *
 * Two DomScan endpoints, one call each, both batched:
 *   /v1/status?name=<stem>&tlds=a,b,c   -> availability, RDAP/WHOIS-backed, authoritative
 *   /v1/prices?tlds=a,b,c               -> registrar prices, USD, many registrars per TLD
 *
 * We dropped our own direct RDAP call: /v1/status is RDAP underneath anyway (`source: "rdap"`)
 * and returns a cleaner shape plus a confidence flag, so maintaining both was redundant.
 *
 * ┌────────────────────────────────────────────────────────────────────────────────┐
 * │ THE PRICES ARE NOT NEO'S PRICES.                                               │
 * │ DomScan returns third-party REGISTRAR list prices in USD. We take the cheapest │
 * │ eligible one and convert at a fixed rate. The user buys from Neo, so this is a │
 * │ placeholder in both currency and seller.                                       │
 * │ → Replace with Neo's own domain search API, which returns availability AND     │
 * │   Neo's actual price. Needs function-head approval. See DECISIONS.md.          │
 * └────────────────────────────────────────────────────────────────────────────────┘
 */

const BASE = "https://domscan.net/v1";

/**
 * CREDIT MODEL — read before changing any query string here.
 *
 * From DomScan's own OpenAPI spec (`x-domscan-credits`):
 *   /v1/status   1 credit PER REQUEST — the TLD count is free, so always batch tlds here.
 *   /v1/prices   1 credit PER TLD × REGISTRAR PAIR. Without a `registrars` filter this
 *                fans out across every registrar they track. A single unfiltered
 *                `?tlds=com,in,co` cost us 78 credits in testing. Always filter.
 *   /v1/rdap     2 credits — strictly worse than /v1/status for our purpose. Don't use.
 *   /v1/suggest  5 credits (2 with check=false). Not used yet; budget for it if we do.
 *   /v1/tlds, /v1/credits   free.
 *
 * With the filter plus the caches below, a cold session costs ~4 credits and a warm one ~1.
 */

/**
 * Single registrar for pricing. One pair per TLD instead of ~25.
 * Porkbun publishes an official feed and prices near the floor, which suits an
 * "indicative from" figure. This is NOT Neo's price either way — see the banner above.
 */
const PRICE_REGISTRARS = "porkbun";

/** Approximate, hardcoded on purpose. Precision here would be false precision — the
 *  underlying price is the wrong seller's anyway. Revisit with Neo's API, not with a FX feed. */
const USD_TO_INR = 95;

export interface DomainInfo {
  domain: string;
  tld: string;
  available: boolean | null;
  /** "authoritative" when DomScan reached the registry; null when we couldn't tell. */
  confidence: string | null;
  /** Indicative INR/year, converted and rounded. Null when unknown. */
  priceInr: number | null;
  /** Cheapest registrar we saw, for honesty in the docs/deck. Not rendered. */
  priceSource: string | null;
}

/** Hard cap on TLDs per request. Three is a real design choice, not just thrift: more than
 *  three alternates turns a confident recommendation into a shopping list. It also bounds
 *  what one crafted query can spend. */
/**
 * 6, up from 3.
 *
 * The credit model makes this nearly free on the expensive half: `/v1/status` is 1 credit per
 * REQUEST regardless of how many TLDs you batch, so availability for six costs exactly what
 * three cost. Only `/v1/prices` bills per TLD, so a cold lookup goes from ~4 credits to ~7.
 *
 * Against a balance of ~9,900 free credits a month that is ~1,400 cold sessions, and the cap
 * was set conservatively before the credit model was understood. Raising it also leaves room
 * for a person to check a domain of their own on top of the three we suggest.
 */
export const MAX_TLDS = 6;

function key(): string {
  const k = process.env.DOMSCAN_API_KEY;
  if (!k) throw new Error("DOMSCAN_API_KEY is not set");
  return k;
}

/**
 * Caches. Process-local, so they warm per serverless instance and per dev-server run —
 * good enough, and there is nothing to operate.
 *
 * The asymmetry matters: PRICES are keyed by TLD and identical for every user, so they cache
 * for hours and are shared across all sessions. AVAILABILITY is per-domain and per-user, so
 * it caches only long enough to survive one session's re-renders.
 */
const priceCache = new Map<string, { at: number; value: { inr: number; registrar: string } | null }>();
const availCache = new Map<string, { at: number; value: { available: boolean; confidence: string | null } }>();

const PRICE_TTL_MS = 6 * 60 * 60 * 1000; // 6h — registrar list prices barely move
const AVAIL_TTL_MS = 10 * 60 * 1000; // 10m — long enough for a demo, short enough to stay true

const fresh = <T,>(e: { at: number; value: T } | undefined, ttl: number): T | undefined =>
  e && Date.now() - e.at < ttl ? e.value : undefined;

async function get(path: string): Promise<any> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "X-API-Key": key(), Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`DomScan ${path} -> ${res.status}`);
  return res.json();
}

/** Cheapest register price across registrars, in USD. Ignores entries DomScan flags ineligible. */
function cheapestUsd(prices: any[]): { usd: number; registrar: string } | null {
  const eligible = (prices ?? []).filter(
    (p) => p?.recommendationEligible !== false && typeof p?.register === "number",
  );
  if (!eligible.length) return null;
  const best = eligible.reduce((a, b) => (b.register < a.register ? b : a));
  return { usd: best.register, registrar: best.registrarName ?? best.registrar ?? "unknown" };
}

/**
 * One round trip per concern, both batched across TLDs. Availability and pricing are fetched
 * concurrently — pricing failing must never stop availability rendering, so they settle
 * independently rather than sharing a try/catch.
 */
export async function lookupDomains(stem: string, tlds: string[]): Promise<DomainInfo[]> {
  // Only ask for what isn't already cached. On a rehearsal run this drops to zero calls.
  const needPrices = tlds.filter((t) => fresh(priceCache.get(t), PRICE_TTL_MS) === undefined);
  const needAvail = tlds.filter(
    (t) => fresh(availCache.get(`${stem}.${t}`), AVAIL_TTL_MS) === undefined,
  );

  const calls: Promise<any>[] = [
    needAvail.length
      ? get(`/status?name=${encodeURIComponent(stem)}&tlds=${encodeURIComponent(needAvail.join(","))}`)
      : Promise.resolve(null),
    needPrices.length
      ? get(
          `/prices?tlds=${encodeURIComponent(needPrices.join(","))}` +
            `&registrars=${encodeURIComponent(PRICE_REGISTRARS)}`,
        )
      : Promise.resolve(null),
  ];

  // Settled, not all: a pricing failure must never stop availability from rendering.
  const [statusRes, pricesRes] = await Promise.allSettled(calls);

  if (statusRes.status === "fulfilled" && statusRes.value) {
    for (const r of statusRes.value?.results ?? []) {
      availCache.set(r.domain, {
        at: Date.now(),
        value: { available: r.available === true, confidence: r.confidence ?? null },
      });
    }
  }

  if (pricesRes.status === "fulfilled" && pricesRes.value) {
    for (const r of pricesRes.value?.data?.results ?? []) {
      const best = cheapestUsd(r.prices);
      priceCache.set(r.tld, {
        at: Date.now(),
        value: best
          ? {
              inr: Math.round((best.usd * USD_TO_INR) / 10) * 10, // nearest ₹10
              registrar: best.registrar,
            }
          : null,
      });
    }
  }

  const availByDomain = new Map<string, { available: boolean; confidence: string | null }>();
  const priceByTld = new Map<string, { inr: number; registrar: string }>();
  for (const tld of tlds) {
    const a = fresh(availCache.get(`${stem}.${tld}`), AVAIL_TTL_MS);
    if (a) availByDomain.set(`${stem}.${tld}`, a);
    const p = fresh(priceCache.get(tld), PRICE_TTL_MS);
    if (p) priceByTld.set(tld, p);
  }

  return tlds.map((tld) => {
    const domain = `${stem}.${tld}`;
    const a = availByDomain.get(domain);
    const p = priceByTld.get(tld);
    return {
      domain,
      tld,
      available: a ? a.available : null,
      confidence: a?.confidence ?? null,
      priceInr: p?.inr ?? null,
      priceSource: p?.registrar ?? null,
    };
  });
}

/** Shared request handler. Framework-agnostic so Vite and Vercel can both mount it. */
export async function handleDomainLookup(
  stemRaw: string | null,
  tldsRaw: string | null,
): Promise<{ status: number; body: unknown }> {
  const stem = (stemRaw ?? "").trim().toLowerCase().replace(/[^a-z0-9-]/g, "");
  if (!stem) return { status: 400, body: { error: "missing or invalid `name`" } };

  const tlds = (tldsRaw ?? "com,in,co")
    .split(",")
    /* Dots are allowed: multi-label TLDs are real (co.uk, com.au) and someone checking a
       domain of their own will type one. Stripping them turned co.uk into "couk", which
       DomScan answers for a TLD that does not exist. Leading/trailing dots are trimmed so
       the sanitiser cannot emit ".com" or "com.". */
    .map((t) => t.trim().toLowerCase().replace(/[^a-z0-9.]/g, "").replace(/^\.+|\.+$/g, ""))
    .filter(Boolean)
    .slice(0, MAX_TLDS);

  try {
    return { status: 200, body: { domains: await lookupDomains(stem, tlds) } };
  } catch (err) {
    return { status: 502, body: { error: err instanceof Error ? err.message : String(err) } };
  }
}

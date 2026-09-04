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

import { checkCoSite, checkTitanOrder, COSITE_SUFFIX } from "./cositeService.js";

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
  /**
   * Neo gives this name away for the first billing cycle. True only for `.co.site`.
   *
   * Separate from `priceInr` on purpose: `priceInr: 0` would render "~\u20b90/yr", which is both
   * ugly and wrong — free-then-renews is not a price of zero. The reveal reads this flag and
   * prints "Free" with its own caveat instead.
   */
  free?: boolean;
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

/**
 * Hard cap on STEMS per request, and the bound on what one crafted query can spend.
 *
 * Three, because that is what the reveal recommends — the model returns three names and this
 * is what makes them three genuinely different names rather than one name in three endings.
 * Each stem is exactly one `/v1/status` credit, so this caps a request at 3 credits of
 * availability plus whatever uncached TLD pricing costs, against ~9,900 free credits a month.
 */
export const MAX_STEMS = 3;

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
export async function lookupDomains(
  /**
   * One or more stems, e.g. `["joeslocks", "bandrakeys", "quickkey"]`.
   *
   * MULTI-STEM, and that is the whole fix for "the suggestions aren't personalised". The
   * reveal shows three names from the model, but this only ever took one stem — so the
   * caller looked up suggestion #1 and filtered the results back down to it, and the three
   * "personalised" names were really one name with three different endings.
   *
   * The credit model makes this cheap in the direction that matters: `/v1/status` bills 1
   * credit PER REQUEST regardless of TLD count, so N stems costs N credits, while `/v1/prices`
   * is keyed by TLD, shared across every session and cached for 6h — so widening stems costs
   * linearly on the cheap call and nothing at all on the expensive one. Widening TLDs would
   * have been the opposite trade.
   */
  stems: string[],
  tlds: string[],
  /** Manual "check a domain I typed" request. Only this opts into the Partner Panel rung. */
  allowPanel = false,
): Promise<DomainInfo[]> {
  /* `.co.site` is Neo's own namespace, not a registrable TLD, so it goes to its own checker.
     Sending it to DomScan would ask about `co.site` itself — which IS registered, so every
     stem would come back taken. See cositeService.ts. It costs no DomScan credit either, so
     it is deliberately not counted against MAX_TLDS. */
  const wantsCoSite = tlds.includes(COSITE_SUFFIX);
  const registrable = tlds.filter((t) => t !== COSITE_SUFFIX);
  const uniqueStems = [...new Set(stems.filter(Boolean))];

  // Only ask for what isn't already cached. On a rehearsal run this drops to zero calls.
  const needPrices = registrable.filter((t) => fresh(priceCache.get(t), PRICE_TTL_MS) === undefined);

  /* One /status per stem, each batching every TLD that stem still needs. A stem whose TLDs
     are all cached makes no call at all. */
  const statusCalls = uniqueStems.map((stem) => {
    const need = registrable.filter(
      (t) => fresh(availCache.get(`${stem}.${t}`), AVAIL_TTL_MS) === undefined,
    );
    return need.length
      ? get(`/status?name=${encodeURIComponent(stem)}&tlds=${encodeURIComponent(need.join(","))}`)
      : Promise.resolve(null);
  });

  /**
   * `.co.site` is checked for the FIRST stem only.
   *
   * The reveal reserves exactly one slot for it (see `availableFromLookup`), so checking the
   * other stems would spend outbound requests — and, on the manual path, Partner Panel budget
   * — on answers nothing renders.
   */
  const coSiteStem = uniqueStems[0];

  /* Settled, not all: a pricing failure must never stop availability from rendering, and the
     co.site check must never stop either — it reaches a different host entirely. */
  const settled = await Promise.allSettled([
    ...statusCalls,
    needPrices.length
      ? get(
          `/prices?tlds=${encodeURIComponent(needPrices.join(","))}` +
            `&registrars=${encodeURIComponent(PRICE_REGISTRARS)}`,
        )
      : Promise.resolve(null),
    wantsCoSite && coSiteStem ? checkCoSite(coSiteStem, { allowPanel }) : Promise.resolve(null),
  ]);

  const statusResults = settled.slice(0, statusCalls.length);
  const pricesRes = settled[statusCalls.length];
  const coSiteRes = settled[statusCalls.length + 1];

  for (const res of statusResults) {
    if (res.status !== "fulfilled" || !res.value) continue;
    for (const r of res.value?.results ?? []) {
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

  const priceByTld = new Map<string, { inr: number; registrar: string }>();
  for (const tld of registrable) {
    const p = fresh(priceCache.get(tld), PRICE_TTL_MS);
    if (p) priceByTld.set(tld, p);
  }

  /**
   * Keyed by FULL DOMAIN, not by TLD.
   *
   * The previous version built `new Map(rows.map(r => [r.tld, r]))` to restore caller order.
   * With one stem that was fine; with several, `joeslocks.com` and `bandrakeys.com` share a
   * key and one of them silently vanishes — the kind of bug that looks like "the API only
   * returned two names".
   */
  const rows = new Map<string, DomainInfo>();

  for (const stem of uniqueStems) {
    for (const tld of registrable) {
      const domain = `${stem}.${tld}`;
      const a = fresh(availCache.get(domain), AVAIL_TTL_MS);
      const p = priceByTld.get(tld);
      rows.set(domain, {
        domain,
        tld,
        available: a ? a.available : null,
        confidence: a?.confidence ?? null,
        priceInr: p?.inr ?? null,
        priceSource: p?.registrar ?? null,
      });
    }
  }

  if (wantsCoSite && coSiteStem) {
    const co = coSiteRes.status === "fulfilled" ? (coSiteRes.value as any) : null;
    const domain = `${coSiteStem}.${COSITE_SUFFIX}`;
    rows.set(domain, {
      domain,
      tld: COSITE_SUFFIX,
      available: co?.available ?? null,
      /* Authoritative only for the sources that read Neo's own ORDER records: the
         purpose-built check, and the Partner Panel bundle lookup on the manual path. The HTTP
         probe sees published sites only — about a fifth of orders — so it can prove a name is
         taken but never that it is free, and must not claim authority for either. */
      confidence: co?.source === "neo" || co?.source === "panel" ? "authoritative" : null,
      /* No price: it is free now and Neo has not published the renewal figure, so any number
         here would be invented. `free` carries the whole story. */
      priceInr: null,
      priceSource: null,
      free: true,
    });
  }

  /* Caller order: stem-major, then the TLD order they asked for, so `.co.site` still sits
     where it was requested rather than always last. */
  const ordered: DomainInfo[] = [];
  for (const stem of uniqueStems) {
    for (const tld of tlds) {
      const row = rows.get(`${stem}.${tld}`);
      if (row) ordered.push(row);
    }
  }
  return ordered;
}

/** Shared request handler. Framework-agnostic so Vite and Vercel can both mount it. */
export async function handleDomainLookup(
  stemRaw: string | null,
  tldsRaw: string | null,
  /**
   * `manual=1` on the query string: the person typed a name and pressed Check.
   *
   * It opts into the Partner Panel rung in cositeService. It is NOT a security boundary — the
   * client controls it, so anyone can set it. What it actually guarantees is that the reveal's
   * own batch lookup, which fires on every page view, never touches an admin-session endpoint.
   * The rate limit in cositeService is the real brake. Said plainly here because a flag like
   * this invites being mistaken for a gate.
   */
  manualRaw: string | null = null,
  /**
   * `titan=<full domain>`: "does Neo already have an order for this name?"
   *
   * A branch on the existing route rather than a new one, on purpose. `/api/domains` is
   * mounted twice — a Vercel function and a Vite middleware — and the last time those two
   * drifted, `manual` was dropped on localhost while production worked, which presents as
   * "the feature doesn't work locally" and cost an afternoon. One more route is one more
   * chance to make that mistake; one more parameter on a route that already exists is not.
   */
  titanRaw: string | null = null,
): Promise<{ status: number; body: unknown }> {
  const titan = (titanRaw ?? "").trim().toLowerCase().replace(/[^a-z0-9.-]/g, "");
  if (titan) {
    /* Must look like a domain. Without this, `?titan=x` queries the panel for a bare word. */
    if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(titan)) {
      return { status: 400, body: { error: "invalid `titan`" } };
    }
    try {
      return { status: 200, body: { titan: await checkTitanOrder(titan) } };
    } catch {
      /* Never a 5xx: the caller uses this to decide whether to warn, and an error here must
         read as "we could not tell", not as "taken". */
      return { status: 200, body: { titan: { domain: titan, taken: null } } };
    }
  }

  /**
   * `name` may now be a COMMA-SEPARATED list of stems.
   *
   * Split before sanitising, never after: the sanitiser strips anything outside `[a-z0-9-]`,
   * so `?name=a,b,c` collapses to the single stem `abc` if the split comes second. That
   * failure is silent and looks like a lookup returning the wrong names.
   */
  const stems = (stemRaw ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase().replace(/[^a-z0-9-]/g, ""))
    .filter(Boolean)
    .slice(0, MAX_STEMS);
  if (!stems.length) return { status: 400, body: { error: "missing or invalid `name`" } };

  const all = (tldsRaw ?? `com,in,co,${COSITE_SUFFIX}`)
    .split(",")
    /* Dots are allowed: multi-label TLDs are real (co.uk, com.au) and someone checking a
       domain of their own will type one. Stripping them turned co.uk into "couk", which
       DomScan answers for a TLD that does not exist. Leading/trailing dots are trimmed so
       the sanitiser cannot emit ".com" or "com.". */
    .map((t) => t.trim().toLowerCase().replace(/[^a-z0-9.]/g, "").replace(/^\.+|\.+$/g, ""))
    .filter(Boolean);

  /* MAX_TLDS bounds what one crafted query can spend at DomScan. `.co.site` spends nothing
     there — it is answered by cositeService — so capping it would only mean the free option
     we most want to show is the one that falls off the end of the list. Exempt it, cap the
     rest, and put it back where the caller asked for it. */
  const coSiteAt = all.indexOf(COSITE_SUFFIX);
  const capped = all.filter((t) => t !== COSITE_SUFFIX).slice(0, MAX_TLDS);
  const tlds =
    coSiteAt === -1
      ? capped
      : [...capped.slice(0, coSiteAt), COSITE_SUFFIX, ...capped.slice(coSiteAt)];

  const allowPanel = manualRaw === "1" || manualRaw === "true";

  try {
    return { status: 200, body: { domains: await lookupDomains(stems, tlds, allowPanel) } };
  } catch (err) {
    return { status: 502, body: { error: err instanceof Error ? err.message : String(err) } };
  }
}

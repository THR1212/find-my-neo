/**
 * Is `<stem>.co.site` already taken?
 *
 * `.co.site` is Neo's own subdomain namespace — the one thing on the domain step Neo can
 * actually sell today (`docs/neo-product-facts.md`), and it is free for the first billing
 * cycle. So it belongs on the reveal alongside the custom TLDs. But DomScan cannot answer
 * for it: DomScan checks REGISTRATIONS, and `foo.co.site` is not a registration — it is a
 * record inside a domain Neo already owns. Asking DomScan for it returns an answer about
 * `co.site` itself, which is registered, i.e. a confident "taken" for every stem.
 *
 * Hence a separate check, with a seam for Neo's real one.
 *
 * ┌──────────────────────────────────────────────────────────────────────────────────────┐
 * │ WIRE `NEO_COSITE_CHECK_URL` BEFORE TRUSTING A GREEN BADGE.                            │
 * │ Neo's own availability endpoint is the only thing that can say a stem is FREE. Until  │
 * │ it is configured we fall back to an HTTP probe that can only ever prove the opposite  │
 * │ — see the two measured facts below. That fallback answers `null` (unknown), never     │
 * │ `true`, and Reveal.tsx renders no badge for null.                                     │
 * └──────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ## Two things measured on 2026-09-03, both of which rule out the obvious approaches
 *
 * 1. **`*.co.site` is a DNS wildcard.** `zzqx7v9nonexistentstem.co.site` resolves to the same
 *    four A records as `co.site` itself (18.161.125.17/.26/.113/.128). A DNS-over-HTTPS
 *    lookup — the cheap keyless check you would reach for first — therefore says "exists"
 *    for every stem in the universe. Do not reintroduce it.
 *
 * 2. **A 404 does not mean free.** The host returns an identical 404 (18,725 bytes) for
 *    every unclaimed stem — but also for a stem that was claimed and never published, and
 *    `docs/data-findings.md` §9 is blunt about how common that is: **31,545 of 44,581 site
 *    orders never published**. Most claimed co.site names are therefore invisible to this
 *    probe. Reading 404 as "available" would put a green badge on names a person can find
 *    taken one keystroke later — the exact florist/thistletwine bug already fixed once in
 *    `src/lib/session.ts`. So: 200 proves taken, everything else proves nothing.
 *
 * No traffic is sent to Neo's production domain SEARCH — CLAUDE.md rule 5. This fetches a
 * published page from the site host, once per stem per session, behind a cache.
 */

/** Neo's namespace. Not a TLD, which is exactly why DomScan cannot answer for it. */
export const COSITE_SUFFIX = "co.site";

/** Free for the first billing cycle — `src/data/plans.json` → `domain.freeFirstCycle`. */
export const COSITE_FREE_FIRST_CYCLE = true;

export interface CoSiteResult {
  domain: string;
  /** true = free, false = taken, null = WE DO NOT KNOW. null must render no badge. */
  available: boolean | null;
  /**
   * Which upstream PRODUCED the answer — never "the cache".
   *
   * Cache state lives in `cached` instead, because conflating the two loses the only thing
   * `source` is for. `domainService` maps `source === "neo"` to
   * `confidence: "authoritative"`; when a cache hit overwrote the source, that confidence
   * silently dropped to null on every request inside the 10-minute TTL, i.e. nearly all of
   * them. Nothing rendered wrongly today (Reveal reads `available`, not `confidence`), but a
   * later gate on `confidence === "authoritative"` — the pattern the DomScan rows already
   * use — would have failed for reasons no one could see.
   */
  source: "neo" | "probe" | "error";
  /** Served from the process-local cache rather than a fresh upstream call. */
  cached?: boolean;
}

/** Same shape and TTL as the availability cache in domainService — per-instance, per-session. */
const cache = new Map<string, { at: number; value: CoSiteResult }>();
const TTL_MS = 10 * 60 * 1000;

/** The probe is a courtesy call to a production host. Keep it short and never let it block. */
const TIMEOUT_MS = 4000;

async function withTimeout(url: string, init: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Neo's real check, when someone configures it.
 *
 * `NEO_COSITE_CHECK_URL` may contain `{stem}` or `{domain}`; if it contains neither, the
 * domain is appended as `?domain=`. `NEO_COSITE_CHECK_TOKEN`, if set, goes in an
 * Authorization header. Deliberately loose about the response shape — nobody has handed us
 * the contract yet, so accept the four spellings this kind of endpoint normally uses rather
 * than guess one and fail closed on the others.
 */
async function askNeo(stem: string, domain: string): Promise<CoSiteResult | null> {
  const template = process.env.NEO_COSITE_CHECK_URL;
  if (!template) return null;

  const url = /\{(stem|domain)\}/.test(template)
    ? template.replace(/\{stem\}/g, encodeURIComponent(stem)).replace(/\{domain\}/g, encodeURIComponent(domain))
    : `${template}${template.includes("?") ? "&" : "?"}domain=${encodeURIComponent(domain)}`;

  const token = process.env.NEO_COSITE_CHECK_TOKEN;
  const res = await withTimeout(url, {
    headers: {
      Accept: "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (!res.ok) throw new Error(`neo cosite check -> ${res.status}`);

  const body = (await res.json()) as Record<string, unknown>;
  /* Positive and negative spellings both appear in the wild, and they mean opposite things.
     Read whichever is actually present; if none is, say unknown rather than assume free. */
  const positive = body.available ?? body.isAvailable;
  const negative = body.taken ?? body.exists ?? body.isTaken;
  const available =
    typeof positive === "boolean" ? positive : typeof negative === "boolean" ? !negative : null;

  return { domain, available, source: "neo" };
}

/**
 * The fallback. Can prove "taken", never "free" — see the header.
 *
 * `redirect: "manual"` on purpose: a claimed name that redirects elsewhere is still claimed,
 * and following the hop would just cost another round trip to learn the same thing.
 */
async function probe(domain: string): Promise<CoSiteResult> {
  const res = await withTimeout(`https://${domain}/`, { redirect: "manual" });
  const taken = res.status === 200 || (res.status >= 300 && res.status < 400);
  return { domain, available: taken ? false : null, source: "probe" };
}

export async function checkCoSite(stem: string): Promise<CoSiteResult> {
  const domain = `${stem}.${COSITE_SUFFIX}`;

  const hit = cache.get(domain);
  if (hit && Date.now() - hit.at < TTL_MS) return { ...hit.value, cached: true };

  let result: CoSiteResult;
  try {
    result = (await askNeo(stem, domain)) ?? (await probe(domain));
  } catch {
    /* Rule 4: every external call degrades, never blocks. Unknown renders no badge, which
       is the honest outcome — we still recommend the name, just without claiming it is free. */
    result = { domain, available: null, source: "error" };
  }

  cache.set(domain, { at: Date.now(), value: result });
  return result;
}

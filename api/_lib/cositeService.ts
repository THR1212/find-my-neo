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
/** How long a hard failure is remembered. Short: an outage should not outlive itself. */
const ERROR_TTL_MS = 30 * 1000;

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
 * Titan's partner token, minted on demand and cached until just before it expires.
 *
 * `POST https://bll.titan.email/partner/token/generate` — Titan's partner auth endpoint, and
 * the availability check sits behind it. Two levels of credential are involved and it is easy
 * to conflate them:
 *
 *   1. A PARTNER CREDENTIAL we hold, sent to mint a token. The endpoint answered
 *      `{"code":"UNAUTHENTICATED","attrs":{"detail":"Auth header missing"}}` to an empty POST
 *      on 2026-09-03, so the mint call is itself authenticated. Its header NAME is
 *      configurable because nobody has told us what it is — do not guess one in code.
 *   2. The SHORT-LIVED TOKEN it returns, sent to the availability check.
 *
 * Both stay server-side. Neither is ever logged, included in an error message, or returned
 * to the caller — a token in a `reportDegraded` string would reach the browser console, and
 * from there anywhere. Errors carry status codes only.
 */
const TOKEN_URL_DEFAULT = "https://bll.titan.email/partner/token/generate";

/**
 * Refresh this long before the stated expiry, so a token cannot die mid-request.
 *
 * Proportional, not a flat 60s. A flat skew wider than the token's own lifetime makes every
 * cached token look already-expired, so every single request re-mints — which turns a cache
 * into a load generator pointed at an auth endpoint. Caught against a stub issuing 2-second
 * tokens: three requests produced three mints and the cache never once hit.
 *
 * Half the lifetime for short tokens, capped at a minute for long ones.
 */
const TOKEN_SKEW_CAP_MS = 60 * 1000;
const skewFor = (lifetimeMs: number): number => Math.min(TOKEN_SKEW_CAP_MS, lifetimeMs / 2);
/** Used when the mint response states no expiry. Short on purpose: re-minting is cheap. */
const TOKEN_FALLBACK_TTL_MS = 5 * 60 * 1000;

let tokenCache: { token: string; expiresAt: number; skewMs: number } | null = null;

/** Only ever called with a value we did not receive from a response body. */
function tokenAuthHeaders(): Record<string, string> {
  const value = process.env.NEO_PARTNER_AUTH;
  if (!value) return {};
  const name = process.env.NEO_PARTNER_AUTH_HEADER ?? "Authorization";
  return { [name]: value };
}

async function mintToken(): Promise<string | null> {
  const value = process.env.NEO_PARTNER_AUTH;
  /* No partner credential means no token can be minted. Return null rather than throw so the
     caller falls through to the probe: a missing credential is a configuration state, not an
     incident, and the reveal must still render. */
  if (!value) return null;

  const url = process.env.NEO_COSITE_TOKEN_URL ?? TOKEN_URL_DEFAULT;
  const body = process.env.NEO_PARTNER_BODY;

  const res = await withTimeout(url, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...tokenAuthHeaders(),
    },
    /* `{}` rather than no body: the endpoint reads JSON, and some gateways reject a POST with
       Content-Type set and nothing behind it. */
    body: body ?? "{}",
  });
  /* Status only. The body of a failed auth response can echo the credential back. */
  if (!res.ok) throw new Error(`partner token mint -> ${res.status}`);

  const json = (await res.json()) as Record<string, unknown>;
  const token =
    json.token ?? json.accessToken ?? json.access_token ?? json.jwt ?? (json.data as Record<string, unknown> | undefined)?.token;
  if (typeof token !== "string" || !token) throw new Error("partner token mint returned no token");

  /* Seconds is the near-universal unit for expiresIn; `exp` is a JWT-style absolute epoch. */
  const expiresIn = json.expiresIn ?? json.expires_in ?? json.ttl;
  const absolute = json.exp;
  const expiresAt =
    typeof expiresIn === "number" && expiresIn > 0
      ? Date.now() + expiresIn * 1000
      : typeof absolute === "number" && absolute > 0
        ? absolute * 1000
        : Date.now() + TOKEN_FALLBACK_TTL_MS;

  tokenCache = { token, expiresAt, skewMs: skewFor(expiresAt - Date.now()) };
  return token;
}

async function partnerToken(forceRefresh = false): Promise<string | null> {
  if (!forceRefresh && tokenCache && Date.now() < tokenCache.expiresAt - tokenCache.skewMs) {
    return tokenCache.token;
  }
  tokenCache = null;
  return mintToken();
}

/**
 * Neo's real check, when someone configures it.
 *
 * `NEO_COSITE_CHECK_URL` may contain `{stem}` or `{domain}`; if it contains neither, the
 * domain is appended as `?domain=`. Auth is a minted partner token when `NEO_PARTNER_AUTH`
 * is set, or a static `NEO_COSITE_CHECK_TOKEN` when the check needs no minting.
 *
 * Deliberately loose about the response shape — nobody has handed us the contract yet, so
 * accept the spellings this kind of endpoint normally uses rather than guess one and fail
 * closed on the others.
 */
async function askNeo(stem: string, domain: string): Promise<CoSiteResult | null> {
  const template = process.env.NEO_COSITE_CHECK_URL;
  if (!template) return null;

  const url = /\{(stem|domain)\}/.test(template)
    ? template.replace(/\{stem\}/g, encodeURIComponent(stem)).replace(/\{domain\}/g, encodeURIComponent(domain))
    : `${template}${template.includes("?") ? "&" : "?"}domain=${encodeURIComponent(domain)}`;

  const call = async (bearer: string | null): Promise<Response> =>
    withTimeout(url, {
      headers: {
        Accept: "application/json",
        ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
      },
    });

  const staticToken = process.env.NEO_COSITE_CHECK_TOKEN;
  let bearer = staticToken ?? (await partnerToken());
  let res = await call(bearer ?? null);

  /* One retry with a freshly minted token on 401/403, and only when the token was minted —
     a static token that is rejected will be rejected again, so retrying it just doubles the
     latency. A cached token can expire between two requests in the same instance, and that
     is a routine race, not an incident. */
  if ((res.status === 401 || res.status === 403) && !staticToken && process.env.NEO_PARTNER_AUTH) {
    bearer = await partnerToken(true);
    res = await call(bearer ?? null);
  }

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

  /* A LADDER, not a single try/catch, and the difference matters when Neo's endpoint is
     configured but broken. `askNeo(...) ?? probe(...)` inside one try looked equivalent and
     was not: a throw from askNeo skipped the `??` entirely and landed in the catch, so a
     500 or an expired credential degraded straight past the probe to "unknown". The probe is
     a weaker signal but not a useless one — it can still prove a name is taken — and rule 4
     says degrade, never block. So each rung falls to the next, and only the bottom gives up.

     Neither rung is allowed to throw out of here: the reveal must render regardless. */
  let result: CoSiteResult | null = null;

  try {
    result = await askNeo(stem, domain);
  } catch {
    result = null; // configured but failing — fall through rather than give up
  }

  if (!result) {
    try {
      result = await probe(domain);
    } catch {
      /* Unknown renders no badge, which is the honest outcome — we still recommend the name
         and still show it as free, we just make no claim about availability. */
      result = { domain, available: null, source: "error" };
    }
  }

  /* Do NOT cache a bottom-rung failure for the full TTL. A transient blip would otherwise
     pin "unknown" on this stem for ten minutes, long past the recovery, and the reveal's own
     lookup would never re-ask. Errors get a short penalty box instead. */
  const at = result.source === "error" ? Date.now() - (TTL_MS - ERROR_TTL_MS) : Date.now();
  cache.set(domain, { at, value: result });
  return result;
}

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
 *    `docs/data-findings.md` §9 quantifies it: of 44,581 site orders only **9,121 (20.5%)
 *    were ever published**, so **35,460 (79.5%) are invisible to this probe**. And Darrel
 *    confirmed 2026-09-03 that an unpublished site **still exists as an active order**, so
 *    the name is genuinely occupied — the probe just cannot see it. The probe therefore
 *    misses roughly four in five taken names. Reading 404 as "available" would put a green
 *    badge on names a person finds taken one keystroke later — the exact florist/thistletwine
 *    bug already fixed once in `src/lib/session.ts`. So: 200 proves taken, everything else
 *    proves nothing, and only Neo's own endpoint can prove free.
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
 * Titan's Partner Panel session token, minted on demand and cached until it expires.
 *
 * The real contract, supplied 2026-09-03, differs from every guess worth making — which is
 * why none of it is inferred here:
 *
 *   POST https://api.titan.email/fa/mail/login
 *   Content-Type: application/json
 *   origin: https://app.titan.email          <- REQUIRED, not decoration
 *   { email, password, device: "browser", iid, rp: { brand: "Titan" } }
 *   -> { "session": "eyJhbGciOi...", "status": "success" }
 *
 * Then the session goes to the check as **`x-auth-token: <session>`** — not
 * `Authorization: Bearer`, which is what an earlier version of this file assumed.
 *
 * Three consequences worth stating, because each one is a trap:
 *
 * 1. **The mint credential is a real Titan login**, email and password, not an API key. It is
 *    read from the environment and never logged, never echoed into an error, never returned to
 *    the caller. A failed login raises the STATUS CODE ONLY: the body of a rejected auth
 *    response can contain what it rejected.
 * 2. **The response carries no expiry of any kind**, and the session is NOT a JWT despite the
 *    documented `eyJhbGciOi...` example — a real login returns an opaque `1:G8lW…`, 34
 *    characters, one segment (measured 2026-09-03). `jwtExpiryMs` is kept for accounts that
 *    may differ, but in practice `TOKEN_FALLBACK_TTL_MS` decides the lifetime and the 401
 *    retry provides the correctness. Where a JWT *is* returned its `exp` is only *read*, never
 *    trusted for authorisation; the worst a bad value can do is make us re-mint early.
 * 3. **This is a login endpoint.** Re-minting on every request would be a credential-stuffing
 *    traffic pattern against Titan's own auth. That is the real reason the cache and the
 *    proportional refresh skew below matter — not latency.
 */
const TOKEN_URL_DEFAULT = "https://api.titan.email/fa/mail/login";
/** Titan's login rejects the request without it. */
const TOKEN_ORIGIN_DEFAULT = "https://app.titan.email";
/** Identifies this caller in Titan's session records. Ours, so it is attributable to us. */
const TOKEN_IID_DEFAULT = "server-findmyneo-001";
/** The header the Partner Panel API expects. Not `Authorization`. */
const CHECK_AUTH_HEADER_DEFAULT = "x-auth-token";

/**
 * Refresh this long before the stated expiry, so a token cannot die mid-request.
 *
 * Proportional, not a flat 60s. A flat skew wider than the token's own lifetime makes every
 * cached token look already-expired, so every request re-mints — which against a LOGIN
 * endpoint is a credential-stuffing traffic shape, not merely wasteful. Caught against a stub
 * issuing 2-second tokens: three requests produced three mints and the cache never once hit.
 *
 * Half the lifetime for short tokens, capped at a minute for long ones.
 */
const TOKEN_SKEW_CAP_MS = 60 * 1000;
const skewFor = (lifetimeMs: number): number => Math.min(TOKEN_SKEW_CAP_MS, lifetimeMs / 2);

/**
 * Used when the session is not a JWT and states no expiry — which, measured against
 * production on 2026-09-03, is the ACTUAL case rather than the exceptional one.
 *
 * Titan's own documentation shows `"session": "eyJhbGciOi..."`, i.e. a JWT. A real login as a
 * Partner Panel user returns `1:G8lW…` — 34 characters, one segment, opaque, and the response
 * carries no expiry field of any kind. So `jwtExpiryMs` returns null in practice and this
 * value decides the cache lifetime. It is kept for the accounts that may genuinely get a JWT;
 * it is not the path to plan around.
 *
 * 30 minutes, not 5, and the justification is the retry rather than the number. We do not know
 * the real TTL and cannot: nothing in the response states it. But an over-long guess is
 * self-healing — an expired session makes the check answer 401, which re-mints and retries
 * transparently (verified). An under-long guess has no such safety net; it just logs in again,
 * and doing that every five minutes per serverless instance against Titan's own auth endpoint
 * is the credential-stuffing traffic shape this cache exists to avoid.
 *
 * So: correctness comes from the 401 retry, and this number only trades login volume against
 * one extra round trip on the first request after a real expiry.
 */
const TOKEN_FALLBACK_TTL_MS = 30 * 60 * 1000;

let tokenCache: { token: string; expiresAt: number; skewMs: number } | null = null;

/**
 * Read `exp` out of a JWT payload without verifying the signature.
 *
 * Reading is the only thing happening: nothing here authorises anything, so an unverified
 * claim is safe to use. The worst a forged or corrupt value can do is make us mint a fresh
 * token sooner than necessary. Returns null for anything that is not a JWT with a sane `exp`,
 * and the caller falls back to a short fixed TTL.
 */
function jwtExpiryMs(token: string): number | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const pad = parts[1].length + ((4 - (parts[1].length % 4)) % 4);
    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/").padEnd(pad, "=");
    const exp = (JSON.parse(atob(b64)) as { exp?: unknown }).exp;
    if (typeof exp !== "number" || !Number.isFinite(exp)) return null;
    const ms = exp * 1000;
    /* Ignore an expiry already in the past or absurdly far out — either means we misread it. */
    const lifetime = ms - Date.now();
    return lifetime > 0 && lifetime < 30 * 24 * 60 * 60 * 1000 ? ms : null;
  } catch {
    return null;
  }
}

async function mintToken(): Promise<string | null> {
  const email = process.env.NEO_PARTNER_EMAIL;
  const password = process.env.NEO_PARTNER_PASSWORD;
  /* No credential means no session can be minted. Return null rather than throw so the caller
     falls through to the probe: unconfigured is a deployment state, not an incident. */
  if (!email || !password) return null;

  const res = await withTimeout(process.env.NEO_COSITE_TOKEN_URL ?? TOKEN_URL_DEFAULT, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      origin: process.env.NEO_PARTNER_ORIGIN ?? TOKEN_ORIGIN_DEFAULT,
    },
    body: JSON.stringify({
      email,
      password,
      device: "browser",
      iid: process.env.NEO_PARTNER_IID ?? TOKEN_IID_DEFAULT,
      rp: { brand: "Titan" },
    }),
  });
  /* Status only — never the body, which can echo the credential back. */
  if (!res.ok) throw new Error(`partner session mint -> ${res.status}`);

  const json = (await res.json()) as Record<string, unknown>;
  /* `session` is Titan's field. The others are kept so a differently-shaped deployment does
     not need a code change, but `session` is the documented one. */
  const token = json.session ?? json.token ?? json.accessToken ?? json.access_token;
  if (typeof token !== "string" || !token) {
    /* Deliberately does not include the body: on a partial success it may carry the session. */
    throw new Error(`partner session mint returned no session (status=${String(json.status)})`);
  }

  const expiresAt = jwtExpiryMs(token) ?? Date.now() + TOKEN_FALLBACK_TTL_MS;
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
 * Neo's real check.
 *
 *   GET https://bll.titan.email/internal/neo/check-domain-availability?domainName=<domain>
 *
 * Both halves of that were recovered by reading the API's own error codes, because the path as
 * supplied did not work. `bll` distinguishes its failures usefully, and the sequence was:
 *
 *   /internal/neo/v2/check-domain-availability -> 404 `UnRegisteredEndpoint`  (no such route)
 *   /internal/neo/check-domain-availability    -> 400 `BAD_REQUEST`           (route EXISTS)
 *     ...whose body says: "domainName or domainNames is required"
 *   ?domainName=<domain>                       -> 401 "Auth header missing"   (param accepted)
 *     ...with `Authorization` present          -> 404 "Hosting server not found"
 *
 * So **there is no `v2`**, and the parameter is `domainName` (or `domainNames`, which implies
 * batch support worth using later — one call for the whole reveal instead of one per stem).
 *
 * ┌──────────────────────────────────────────────────────────────────────────────────────────┐
 * │ IT STILL CANNOT ANSWER FROM OUTSIDE TITAN'S NETWORK.                                     │
 * │ Every domain returns `NOT_FOUND / "Hosting server not found"` — including `titan.email`   │
 * │ and `neo.space`, which certainly exist. So that is a blanket downstream failure, not an   │
 * │ availability answer, and it must never be read as "free". A garbage `Authorization` value │
 * │ produces the identical response, so this edge is not validating credentials either: we    │
 * │ are reaching the service past its gateway, and nothing it says here is trustworthy.       │
 * └──────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * The ladder in `checkCoSite` degrades all of it to the probe, so the reveal stays correct.
 * Response reading is deliberately loose: the success shape has still never been observed.
 */
async function askNeo(stem: string, domain: string): Promise<CoSiteResult | null> {
  const template = process.env.NEO_COSITE_CHECK_URL;
  if (!template) return null;

  const url = /\{(stem|domain)\}/.test(template)
    ? template.replace(/\{stem\}/g, encodeURIComponent(stem)).replace(/\{domain\}/g, encodeURIComponent(domain))
    : `${template}${template.includes("?") ? "&" : "?"}domain=${encodeURIComponent(domain)}`;

  const headerName = process.env.NEO_COSITE_AUTH_HEADER ?? CHECK_AUTH_HEADER_DEFAULT;

  const call = async (token: string | null): Promise<Response> =>
    withTimeout(url, {
      headers: {
        Accept: "application/json",
        /* The session goes in BOTH headers, deliberately, because the two sources of truth
           disagree and we cannot yet tell which is right in production:

           - Titan's documentation says Partner Panel APIs read `x-auth-token`.
           - This route, measured 2026-09-03, answers `401 "Auth header missing"` when ONLY
             `x-auth-token` is set, and gets past that gate when `Authorization` is present.

           Same secret, same host, same TLS connection, so sending both costs nothing and
           removes a guess. It is not belt-and-braces sloppiness: picking one would be a coin
           flip, and picking wrong looks identical to "no access" — the failure mode that has
           already cost time here. Set NEO_COSITE_AUTH_HEADER to pin one once Titan confirms. */
        ...(token ? { [headerName]: token, Authorization: `Bearer ${token}` } : {}),
        origin: process.env.NEO_PARTNER_ORIGIN ?? TOKEN_ORIGIN_DEFAULT,
      },
    });

  const staticToken = process.env.NEO_COSITE_CHECK_TOKEN;
  let token = staticToken ?? (await partnerToken());
  let res = await call(token ?? null);

  /* One retry with a freshly minted session on 401/403, and only when the session was minted.
     A static token that is rejected will be rejected again, so retrying it doubles the latency
     for nothing — and against a login endpoint an unconditional retry is a bad habit to build.
     A cached session expiring between two requests in the same instance is a routine race. */
  const canRemint = !staticToken && !!process.env.NEO_PARTNER_EMAIL;
  if ((res.status === 401 || res.status === 403) && canRemint) {
    token = await partnerToken(true);
    res = await call(token ?? null);
  }

  if (!res.ok) throw new Error(`neo cosite check -> ${res.status}`);

  const body = (await res.json()) as Record<string, unknown>;
  /* Positive and negative spellings both appear in the wild, and they mean opposite things.
     Read whichever is actually present; if none is, say unknown rather than assume free. */
  const positive = body.available ?? body.isAvailable;
  const negative = body.taken ?? body.exists ?? body.isTaken ?? body.registered;
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

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
  source: "neo" | "panel" | "probe" | "error";
  /** Served from the process-local cache rather than a fresh upstream call. */
  cached?: boolean;
}

/** Same shape and TTL as the availability cache in domainService — per-instance, per-session. */
const cache = new Map<string, { at: number; value: CoSiteResult }>();
const TTL_MS = 10 * 60 * 1000;
/** How long a hard failure is remembered. Short: an outage should not outlive itself. */
const ERROR_TTL_MS = 30 * 1000;

/** Partner Panel bundle lookup. `api.flockmail.com` — the host the real panel uses. */
const PANEL_URL_DEFAULT = "https://api.flockmail.com/partner-panel/bundle/list";
const PANEL_UA_DEFAULT =
  "client=partner_panel;tp=titan;os=Linux;browser=Node;appVersion=294;locale=en";

/**
 * A cap on panel calls per instance, because `manual=1` is NOT a security boundary.
 *
 * The manual path was chosen over the automatic one on the reasoning that it is user-initiated
 * and therefore low-volume. That reasoning is only half true and the half that fails matters:
 * the flag arrives in a query string the client controls, so anyone can set it. What it really
 * buys is that the reveal's own batch lookup never touches the panel — incidental volume, not
 * access control.
 *
 * So the actual limit is this counter. It is per-instance, which on Vercel means the real
 * ceiling is higher than the number suggests; it is a brake on casual enumeration, not a wall.
 * The per-domain cache above does the rest of the work, since repeat checks of one stem are
 * free. Say so plainly rather than let the flag imply a protection it does not provide.
 */
const PANEL_MAX_PER_WINDOW = 30;
const PANEL_WINDOW_MS = 10 * 60 * 1000;
let panelWindowStart = 0;
let panelCallsInWindow = 0;

function panelBudgetAvailable(): boolean {
  const now = Date.now();
  if (now - panelWindowStart > PANEL_WINDOW_MS) {
    panelWindowStart = now;
    panelCallsInWindow = 0;
  }
  if (panelCallsInWindow >= PANEL_MAX_PER_WINDOW) return false;
  panelCallsInWindow += 1;
  return true;
}

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
/**
 * `Authorization`, carrying a PARTNER token raw — no `Bearer` prefix.
 *
 * Measured 2026-09-03 against staging, and every other combination fails differently, which is
 * how we know this one is right rather than merely untested:
 *
 *   Authorization: p_54:<secret>          -> reaches the handler
 *   Authorization: Bearer p_54:<secret>   -> 404 "Hosting server not found"
 *   x-auth-token:  p_54:<secret>          -> 401 UNAUTHENTICATED
 *
 * So the `Bearer` prefix breaks it and `x-auth-token` is not read at all, despite being what
 * the Partner Panel documentation specifies for its APIs. Do not "restore" either.
 */
const CHECK_AUTH_HEADER_DEFAULT = "Authorization";

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
 * The mint in flight, if there is one.
 *
 * Without it, N concurrent checks that all see a 401 each fire their own login — a thundering
 * herd against a production login endpoint, from a function that scales out precisely when it
 * is busiest. Sharing the promise makes it one login per instance per expiry, which is what
 * the cache was always meant to mean.
 */
let mintInFlight: Promise<string | null> | null = null;

/**
 * When a failed mint may be retried.
 *
 * A dead or rate-limiting login endpoint would otherwise be re-hit by every manual check.
 * Nothing here loops — each request tries once and degrades — but "once per request" against
 * something already failing is still a stampede at the wrong moment. After a failure the
 * ladder falls to the probe for this long without asking again.
 */
let mintBlockedUntil = 0;
const MINT_COOLDOWN_MS = 60 * 1000;

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

/**
 * A cached session, or one fresh login — never two at once, and never a retry storm.
 *
 * NOTHING HERE WRITES TO THE ENVIRONMENT, and that is a deliberate difference from
 * zephyr-support, which PATCHes the new token into Heroku config vars. That works there
 * because a dyno restart is cheap; the Vercel equivalent is a redeploy, which would tear down
 * the very request that triggered it and is far worse than simply re-minting. The token lives
 * in this module and dies with the instance.
 */
async function partnerToken(forceRefresh = false): Promise<string | null> {
  if (!forceRefresh && tokenCache && Date.now() < tokenCache.expiresAt - tokenCache.skewMs) {
    return tokenCache.token;
  }
  /* A recent failure. Fall through to the probe rather than queue behind a broken endpoint. */
  if (Date.now() < mintBlockedUntil) return null;
  /* Someone else is already logging in — wait for theirs instead of starting a second. */
  if (mintInFlight) return mintInFlight;

  tokenCache = null;
  mintInFlight = mintToken()
    .catch((err) => {
      mintBlockedUntil = Date.now() + MINT_COOLDOWN_MS;
      /* Swallowed on purpose: an unmintable session is a degradation, not an incident, and
         CLAUDE.md rule 4 says the reveal renders regardless. The caller sees null and the
         ladder falls to the probe. */
      console.error("[cosite] partner session mint failed:", String(err));
      return null;
    })
    .finally(() => {
      mintInFlight = null;
    });
  return mintInFlight;
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
 * │ `"Hosting server not found"` MEANS BAD CREDENTIAL, NOT BROKEN INFRASTRUCTURE.            │
 * │ This was misread once and the correction matters. It is the response to an `Authorization`│
 * │ value the service cannot resolve to a partner — a garbage string, a mail session, or a    │
 * │ correct partner token wrapped in `Bearer` all produce it. It is NOT a downstream outage,  │
 * │ and it is NOT an availability answer, so it must never be read as "free".                 │
 * │                                                                                          │
 * │ Prod returned it for every domain simply because we had no partner token at all. With a   │
 * │ `p_54:`-shaped token, staging resolves the partner and reaches the handler — which then   │
 * │ returns 500 for every VALID domain, while a bare stem correctly returns `INVALID_DOMAIN`. │
 * │ So the request shape is right and the remaining failure is server-side.                   │
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
        /* Raw, and one header only. An earlier version sent the token in `x-auth-token` AND
           as `Authorization: Bearer` to cover both conventions; staging then proved both of
           those wrong — `Bearer` returns "Hosting server not found" and `x-auth-token` returns
           401. The dual-header hedge is gone because there is nothing left to hedge. */
        ...(token ? { [headerName]: token } : {}),
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

  /* Every non-2xx throws, which the ladder turns into a probe fallback. Spelled out because
     three of these look like answers and are not: 404 "Hosting server not found" is a
     credential the service could not resolve, 500 is the handler failing on a valid domain,
     and INVALID_DOMAIN means we sent something that is not a domain. None of them means free. */
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
 * Titan's Partner Panel bundle lookup — the only source that currently ANSWERS.
 *
 *   GET https://api.flockmail.com/partner-panel/bundle/list?query=<domain>
 *   x-auth-token: <session>
 *
 * Verified against production 2026-09-03: a name with an order returns `200`, a name without
 * returns `404`. Reached only from the MANUAL "check a domain I typed" path — the reveal's own
 * batch lookup never calls it. See `PANEL_MAX_PER_WINDOW` for why that split is about volume
 * rather than access.
 *
 * ┌──────────────────────────────────────────────────────────────────────────────────────────┐
 * │ WE READ THE STATUS CODE AND NEVER THE BODY. THIS IS NOT AN OPTIMISATION.                 │
 * │ A 200 body carries the CUSTOMER'S email address, name, customerId and order history.     │
 * │ There is no `res.json()` or `res.text()` below and there must never be. The status is a   │
 * │ complete answer — 200 means an order holds the name, 404 means none does — so parsing     │
 * │ could only ever add a liability. Add body parsing here and you have created a PII leak    │
 * │ in a public-facing function.                                                             │
 * └──────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ┌──────────────────────────────────────────────────────────────────────────────────────────┐
 * │ ONLY FOR `.co.site`. A 404 means "not in Titan's system" — the same as free inside Neo's  │
 * │ OWN namespace and nothing at all outside it. Asked about `foo.com` this API answers 404   │
 * │ for a domain that is very much registered, so reading that as available would call a      │
 * │ taken domain free. `checkCoSite` is the only caller and `domainService` only reaches it    │
 * │ for the co.site TLD. Keep it that way.                                                   │
 * └──────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * ## The session, and what changed on 03 Sep
 *
 * This took a static `NEO_PARTNER_SESSION` alone — a token pasted by a person, which expires
 * mid-demo and then leaves the check silent. The note here said minting one in code was not
 * something a serverless function should do on cold start.
 *
 * That was overstated, and Hari was right to push back. `zephyr-support` has done exactly this
 * in production for months: `Services/token_service.py:17` logs in on a 401 and even persists
 * the result through the Heroku config-vars API. The pattern is proven, not novel.
 *
 * So `partnerToken()` now backs this up when the static session is absent or has expired.
 * WHAT THAT DOES NOT CHANGE, and must not:
 *
 *   - Only the MANUAL path reaches here. The reveal's batch of four suggestions does not, so
 *     the volume is one lookup per person who types a name, not four per page view.
 *   - `PANEL_MAX_PER_WINDOW` still caps it. A credential that refreshes itself makes the rate
 *     limit MORE important, not less: expiry used to be a natural ceiling and now is not, so
 *     the counter is the only thing bounding the blast radius.
 *   - Status code only, never the body. See the banner above.
 *
 * The difference from zephyr, and the reason for those three: zephyr's endpoint is internal.
 * This one sits behind a page anyone can open, and a public function backed by a support
 * session is an enumeration oracle — status codes alone tell you which domains exist in
 * Titan's system. A working `check-domain-availability` is still the right fix (rung 1, which
 * wins the moment its 500 is repaired); this is what we have while that is broken.
 */
async function askPartnerPanel(domain: string): Promise<CoSiteResult | null> {
  /**
   * THE SINGLE GATE ON THE ADMIN SESSION. Off unless NEO_PARTNER_PANEL_LOOKUP=1.
   *
   * Placed on the function rather than on its callers, because there are two of them and the
   * one that mattered was the one nobody was looking at. `checkTitanOrder` was gated on 04 Sep
   * after it was found answering for arbitrary domains; `checkCoSite` reaches the same session
   * from a different rung, and `manual=1` is a query-string flag the client controls, so
   * `?name=<anything>&tlds=co.site&manual=1` is enumerable in exactly the same way.
   *
   * The DATA is far less sensitive than the other oracle's — `<stem>.co.site` availability is
   * Neo's own namespace, which their public domain-selection step already discloses. The
   * MECHANISM is the problem: a real Titan admin login, spent answering public queries from a
   * public URL, rate-limited only per serverless instance.
   *
   * Off costs the reveal nothing. The batch lookup never used this rung anyway (it answers
   * `null` and renders no badge), and the "FREE" label is a product fact, not a lookup result.
   * Only a hand-typed `.co.site` loses its authoritative answer, and it degrades to the probe.
   */
  if (process.env.NEO_PARTNER_PANEL_LOOKUP !== "1") return null;

  /* A pasted session wins when present: it costs no login, and it is what someone debugging
     with tools/cosite-check.mjs already has to hand. Minting is the fallback, not the norm. */
  const pasted = process.env.NEO_PARTNER_SESSION;
  const session = pasted ?? (await partnerToken());
  if (!session) return null;

  /* Budget checked AFTER we have a session but BEFORE the first call, so a run that cannot
     ask anything never spends a login on it either. */
  if (!panelBudgetAvailable()) return null;

  const base = process.env.NEO_PARTNER_PANEL_URL ?? PANEL_URL_DEFAULT;
  const call = (token: string) =>
    withTimeout(`${base}?query=${encodeURIComponent(domain)}`, {
      headers: {
        "x-auth-token": token,
        "x-user-agent": process.env.NEO_PARTNER_PANEL_UA ?? PANEL_UA_DEFAULT,
        Accept: "application/json",
      },
    });

  let res = await call(session);

  /**
   * One re-mint on an expired session, and only when we minted it ourselves.
   *
   * Two conditions, both deliberate. A pasted `NEO_PARTNER_SESSION` that has expired is a
   * person's to replace — logging in behind it would hide the fact that the pasted value is
   * dead, and they would never know to update it. And the retry is capped at one: an
   * unconditional loop against a login endpoint is a bad habit whatever the status code.
   */
  if (res.status === 401 && !pasted && process.env.NEO_PARTNER_EMAIL) {
    const fresh = await partnerToken(true);
    if (fresh) res = await call(fresh);
  }

  /* Status only. See the banner above — do not add body parsing. */
  if (res.status === 200) return { domain, available: false, source: "panel" };
  if (res.status === 404) return { domain, available: true, source: "panel" };

  /* 403, 5xx, or a 401 we could not refresh: say nothing. An expired admin session must never
     read as "this domain is free". */
  return null;
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

/**
 * Is there ALREADY a Titan order for this domain? Registrable names included.
 *
 * DomScan answers a different question from the one that matters at checkout. It reads the
 * public registry, so it can say `joeslocks.com` is unregistered — and Titan can still hold an
 * order for it, at which point the person we sent there cannot buy the name we recommended.
 * The Partner Panel bundle lookup is the only source that sees Neo's own order records, and it
 * is domain-agnostic: it queries by name, not by TLD, so it answers for `.com` exactly as it
 * answers for `.co.site`.
 *
 * DELIBERATELY NOT CALLED FOR EVERY SUGGESTION. This is one call for the ONE name the person
 * has actually settled on, made when they settle on it — not three at reveal. Three per page
 * view is precisely the traffic `PANEL_MAX_PER_WINDOW` exists to keep off an admin-session
 * endpoint, and it would burn the budget on two names nobody is going to buy. Checking the
 * chosen name is also strictly better at the stated job, which is stopping someone creating
 * an order for a domain that already exists.
 *
 * `taken: null` means we could not tell, and null must render as silence: an unreachable
 * admin session is not evidence that a name is free, nor that it is taken.
 */
export async function checkTitanOrder(domain: string): Promise<{ domain: string; taken: boolean | null }> {
  /**
   * OFF UNLESS EXPLICITLY ENABLED, and that default is the whole point.
   *
   * This function is reached from `/api/domains?titan=<domain>`, which is a public route on a
   * public deployment. Backed by a Partner Panel admin session it answers, for ANY domain, a
   * clean yes/no on whether Titan holds an order for it — which is an enumeration oracle over
   * the customer list, exactly the thing Reveal.tsx's header and this file's own notes warned
   * against on 03 Sep. Verified live on 04 Sep: google.com -> taken, zoho.com -> free.
   *
   * The rate limit below bounds volume; it does not stop the disclosure. Since the feature is
   * a nice-to-have (not recommending a name Neo already sold) and the exposure is over customer
   * data, the safe state is the default and turning it on is a deliberate act.
   *
   * `null` degrades to exactly the behaviour before this existed: no name is filtered, the
   * manual check adds the domain as before, and nothing on screen says anything.
   */
  if (process.env.NEO_PARTNER_PANEL_LOOKUP !== "1") {
    return { domain, taken: null };
  }

  const key = `titan:${domain}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS && hit.value.available !== null) {
    return { domain, taken: hit.value.available === false };
  }

  let result: CoSiteResult | null = null;
  try {
    result = await askPartnerPanel(domain);
  } catch {
    result = null;
  }

  /* No probe rung here, unlike checkCoSite. The probe asks whether a SITE is published, which
     for a registrable domain someone else owns is a question about the wider internet rather
     than about Neo — a parked .com would read as "taken at Titan", which is false. */
  if (!result) return { domain, taken: null };

  cache.set(key, { at: Date.now(), value: result });
  return { domain, taken: result.available === false };
}

export async function checkCoSite(
  stem: string,
  /**
   * `allowPanel` opts this call into the Partner Panel rung, and only the manual
   * "check a domain I typed" path sets it. The reveal's own batch lookup does not, so a page
   * view never touches an admin-session endpoint. See PANEL_MAX_PER_WINDOW — this is a volume
   * split, not an access boundary.
   */
  { allowPanel = false }: { allowPanel?: boolean } = {},
): Promise<CoSiteResult> {
  const domain = `${stem}.${COSITE_SUFFIX}`;

  const hit = cache.get(domain);
  /* A cached "unknown" is not good enough to answer a manual check: the person typed a name
     and pressed a button, and the probe's silence is exactly what the panel exists to
     improve on. So a manual check re-asks when the cached answer is inconclusive, and reuses
     a cached definite yes/no as normal. */
  if (hit && Date.now() - hit.at < TTL_MS) {
    const conclusive = hit.value.available !== null;
    /**
     * A PANEL-DERIVED ANSWER IS NOT SERVED TO A CALLER THAT WAS NOT ALLOWED THE PANEL.
     *
     * Measured on 04 Sep: `bakery.co.site` and `coffee.co.site` came back
     * `authoritative` on the plain batch path, seconds after a `manual=1` request had warmed
     * the cache on the same instance. No panel call was made — the cache simply handed the
     * earlier one over. So the batch path could report an admin-sourced answer, which is the
     * exact separation `manual=1` exists to maintain, quietly undone by a cache hit.
     *
     * Non-deterministic, too, which is worse: Vercel routes across instances, so the same
     * request answered `authoritative` or `null` depending on which one took it.
     */
    const fromPanel = hit.value.source === "panel";
    if (fromPanel && !allowPanel) {
      // fall through and re-derive with the rungs this caller IS allowed
    } else if (conclusive || !allowPanel) {
      return { ...hit.value, cached: true };
    }
  }

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

  /* Rung 2: the Partner Panel, manual path only. Ordered AFTER askNeo on purpose even though
     it is the one that currently works — `check-domain-availability` is purpose-built and
     returns no customer data, so it should win the moment its 500 is fixed, with no code
     change here. */
  if (!result && allowPanel) {
    try {
      result = await askPartnerPanel(domain);
    } catch {
      result = null;
    }
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

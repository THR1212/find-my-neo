# Reaching `check-domain-availability` on bll — access request

**Tested:** 03 Sep 2026 · **Hosts:** `bll.titan.email` (prod),
`flockmail-bll.flock-staging.com` (staging) · **Caller:** Vercel serverless function, public
internet · **Project:** Find My Neo (Ignite 2026)

We need to ask Titan whether a `.co.site` subdomain is already taken. We now have the right host,
path, method, parameter and auth header — the endpoint validates our input and rejects a
malformed domain correctly. **It then returns `500 InternalServerError` for every well-formed
domain.**

That is the whole ask: one server-side failure, with request IDs, on a request we can no longer
improve from outside.

> **Read the correction in "The blocker" first if you saw an earlier version of this document.**
> `"Hosting server not found"` is what an unresolvable partner credential returns — not a
> downstream outage, as we first assumed.

---

## Why we need it

Find My Neo recommends four domains on its reveal screen: three registrable TLDs plus
`<stem>.co.site`, marked free for the first billing cycle. For the `.co.site` one we need a
yes/no on whether the name is already in use.

**DomScan cannot answer for it.** DomScan checks *registrations*, and `foo.co.site` is a record
inside a domain Titan already owns — so it answers about `co.site` itself, which is registered,
returning a confident "taken" for every stem.

**Our fallback is a poor substitute, and we know exactly how poor.** It is an HTTP probe of
`https://<stem>.co.site/`, so it only sees **published** sites — and only **9,121 of 44,581**
site orders were ever published. Since an unpublished site still holds its name as an active
order, the probe misses roughly **four in five** taken names. It can prove "taken", never "free".

---

## bll is healthy — this was never a host-wide outage

Same host, same client, same minute:

| Endpoint | Result | Reading |
|---|---|---|
| `GET /internal/ip-to-country` | `200` | Serves fine, no auth needed |
| `GET /external/cello/reward-details` | `200` | Serves fine |
| `POST /partner/token/generate` | `401 UNAUTHENTICATED` | Route exists, wants auth |

So the `/internal/` prefix **is** publicly routable — the prefix alone is not the barrier.

And bll usefully distinguishes `UnRegisteredEndpoint` (no such route) from `UNAUTHENTICATED` /
`BAD_REQUEST` (route is there). That distinction is what let us find the real path.

---

## How we found the path and the parameter

Each response narrowed the next request, so the order matters:

**1.** `GET /internal/neo/v2/check-domain-availability`
```json
404  {"error":"UnRegisteredEndpoint","desc":"Endpoint not Registered"}
```
The path as specified to us. **No such route.** Identical with and without a valid session, so
not an auth problem.

**2.** `GET /internal/neo/check-domain-availability`
```json
400  {"code":"BAD_REQUEST","attrs":{"detail":"domainName or domainNames is required"}}
```
**Dropping `v2` finds the route** — a different error class, and the body names the parameter
itself.

**3.** `GET …/check-domain-availability?domainName=proofandbutter.co.site`
with `x-auth-token: <valid session>`
```json
401  {"code":"UNAUTHENTICATED","attrs":{"detail":"Auth header missing"}}
```
Parameter accepted. But **`x-auth-token` is not read as an auth header here**, despite being
what the Partner Panel docs specify.

**4.** Same request, with `Authorization: Bearer <mail session>`
```json
404  {"code":"NOT_FOUND","desc":"Hosting server not found"}
```
We first read this as a downstream failure. It is not — see the correction below. It means the
service could not resolve that credential to a partner, because a Partner Panel mail session is
the wrong credential for this route.

**5.** Staging host, `Authorization: p_54:<partner token>` (raw, no `Bearer`)
```json
500  {"code":"InternalServerError","desc":"An internal error"}
```
**Auth resolves and the request reaches the handler.** Which then fails — and that is where the
remaining problem lives.

---

## The blocker

### Corrected 03 Sep, after testing against staging with a partner token

**An earlier version of this document called `"Hosting server not found"` a blanket downstream
failure. That was wrong, and the correction changes the whole diagnosis.**

It is the response to an `Authorization` value the service cannot resolve to a partner. Prod
returned it for every domain simply because **we had no partner token at all** — we were sending
a Partner Panel mail session from `/fa/mail/login`, which is not the credential this route wants.

With a `p_54:`-shaped partner token against staging, the auth resolves and the request reaches
the handler. The full matrix:

| `Authorization` value | Result |
|---|---|
| `p_54:<valid secret>` | `500 InternalServerError` |
| `p_54:<wrong secret>` | `500 InternalServerError` |
| `Bearer p_54:<valid secret>` | `404 "Hosting server not found"` |
| `garbage` | `404 "Hosting server not found"` |
| token in `x-auth-token` instead | `401 UNAUTHENTICATED` |

So: **the token goes in `Authorization` raw, with no `Bearer` prefix**, and `x-auth-token` is not
read by this route at all — despite being what the Partner Panel docs specify for its APIs.

### What now fails: the handler 500s on every valid domain

Host `flockmail-bll.flock-staging.com`, `GET`, partner token, singular `domainName`:

```
domainName=foo.co.site                     500  InternalServerError
domainName=test.co.site                    500  InternalServerError
domainName=zzqx7v9nonexistentstem.co.site  500  InternalServerError
domainName=example.com                     500  InternalServerError
domainName=foo.cas.site                    500  InternalServerError

domainName=foo         (bare stem)         INVALID_DOMAIN  "Invalid domain name foo"
domainName=            (empty)             INVALID_DOMAIN  "Invalid domain name"
```

**The request shape is now correct.** The endpoint validates the domain format — a bare stem is
properly rejected as `INVALID_DOMAIN` — and then returns `500` for every well-formed domain,
whether it plausibly exists (`example.com`) or certainly does not. That is a server-side failure,
not a request we can fix from here.

`POST` returns `HTTP method not allowed`, so it is `GET`-only.

### The `500` is not the namespace, and not a missing `partnerId`

Both were checked, because both were plausible. Neither changes anything — the staging namespace
domain we were given behaves exactly like the production-namespace ones:

```
domainName=14test.costaging.site                      500  InternalServerError
domainName=14test.costaging.site&partnerId=71         500  InternalServerError
domainName=test.costaging.site&partnerId=71           500  InternalServerError
domainName=zzqx7v9nonexistent.costaging.site&partnerId=71   500  InternalServerError
domainName=foo.co.site&partnerId=71                   500  InternalServerError

partnerId as a header instead (x-partner-id / partnerId / x-partner)   500  all three

domainName=notadomain                                 INVALID_DOMAIN   <- validation still runs
```

The last line matters: `INVALID_DOMAIN` proves the request still reaches the handler's own
validation, so the `500` is downstream of everything we control. It is identical for a domain
that exists, one that does not, the staging namespace, the production namespace, with and without
`partnerId`, and with `partnerId` in three header spellings.

### The partner id makes no difference either

Tested with the same secret under four different partner prefixes:

```
Authorization: p_71:<secret>    500  InternalServerError
Authorization: p_54:<secret>    500  InternalServerError
Authorization: p_1:<secret>     500  InternalServerError
Authorization: p_999:<secret>   500  InternalServerError
```

`p_999` is almost certainly not a real partner, and it produces the same `500` rather than an
authentication error. So **the `p_N:` prefix satisfies a format check and the handler then fails
before doing anything partner-specific.** The `p_54` / partnerId-71 mismatch was a red herring.

Leading whitespace in the value (`domainName=%2014test.costaging.site`) also makes no
difference — it is evidently trimmed, and returns the same `500`.

### Everything testable from outside is now eliminated

| Variable | Tried | Effect on the `500` |
|---|---|---|
| Namespace | `costaging.site`, `co.site`, `cas.site` | none |
| Domain exists | `14test…`, `example.com`, `zzqx7v9nonexistent…` | none |
| `partnerId` query param | present / absent, `71` | none |
| `partnerId` header | `x-partner-id`, `partnerId`, `x-partner` | none |
| Partner prefix in token | `p_71`, `p_54`, `p_1`, `p_999` | none |
| Leading whitespace | with / without | none |
| Method | `GET` / `POST` | `POST` → method not allowed |
| Auth header | `Authorization` raw / `Bearer` / `x-auth-token` | raw is the only one that reaches the handler |

Meanwhile `domainName=notadomain` still returns `INVALID_DOMAIN`, so the request reaches the
handler's own validation every time. **There is no remaining variable on the caller's side. This
needs someone with the service logs.**

### The plural parameter needs a form we have not guessed

`domainNames` accepts the repeated-parameter form (`?domainNames=a&domainNames=b`) far enough to
reach the handler and 500. Every other form we tried returns
`400 BAD_REQUEST "Unknown error in parsing request"`: a single value, a comma-separated list, and
a JSON array. Worth confirming the intended encoding, since batching would let us check the whole
reveal in one call.

### Request IDs for tracing

```
0903_084256_2_ldHxnhaZoG   repeated domainNames  -> 500
0903_084317_2_gG36RlnFAX   domainName=foo.co.site -> 500
0903_084321_2_XpCjoadC4o   domainName=test.co.site -> 500
0903_084322_2_yznXQpQ2Np   domainName=zzqx...co.site -> 500
0903_083024_3_8I4W9letpB   prod, no auth header  -> 401

0903_085754_2_MC5sQwFnvr   14test.costaging.site&partnerId=71 -> 500
0903_085755_2_CtwkEHtxEp   14test.costaging.site (no partnerId) -> 500
0903_085756_2_1tQT6eYoFk   foo.co.site&partnerId=71 -> 500
0903_085757_2_T7us9WBztN   zzqx7v9nonexistent.costaging.site&partnerId=71 -> 500
0903_085758_2_jU6oxuRqME   test.costaging.site&partnerId=71 -> 500

0903_090626_2_O3I2N5QIm9   p_71 token, 14test.costaging.site -> 500
0903_090642_2_st0U504iGV   p_71 token, clean value           -> 500
0903_090645_2_jmMnuv8VBK   p_54 token, same value            -> 500
0903_090647_2_tAb43TVDH5   p_1 token,  same value            -> 500
0903_090648_2_4Zh1On1lSi   p_999 token, same value           -> 500
```

The last five landed within seven seconds of each other on the same handler, differing only in
the partner id, which makes them a clean set to diff in the logs.

## What we need

**Q1 — Why does the handler return `500` for every valid domain?**
`flockmail-bll.flock-staging.com`, `GET`, partner token `p_54:…`,
`?domainName=14test.costaging.site`. Request IDs above. `INVALID_DOMAIN` on a malformed input
proves we reach the handler's validation, so the `500` sits downstream of everything we control.
Ruled out already: the namespace (`costaging.site` behaves like `co.site`), a missing `partnerId`
(as a query parameter and in three header spellings), and whether the domain exists.
*This is the only blocker.*

**Q1a — ~~Does the `p_54:` token need to match partnerId 71?~~ Answered: no.**
`p_71`, `p_54`, `p_1` and `p_999` all return the same `500`. Since `p_999` is not a real partner
and still gets past auth, the prefix only satisfies a format check and the handler fails before
anything partner-specific happens.

**Q2 — Is there a production equivalent of the staging host, and a production partner token?**
We were given `flockmail-bll.flock-staging.com` with a staging token. `bll.titan.email` returns
`"Hosting server not found"` for the same request, which we now read as "no partner credential" —
so a prod partner token may be all that is missing there.

**Q3 — How is a `p_54:…` partner token minted, and what does it need?**
`POST /partner/token/generate` returns `401 "Auth header missing"` to both an empty POST and a
Partner Panel mail session. We currently only have a token that was handed to us directly, which
is not something we can ship.

**Q4 — What encoding does `domainNames` expect, and what does a `200` look like?**
Repeated parameters reach the handler; single, comma-separated and JSON-array forms all fail
parsing. We have never seen a success response, so we read `available` / `isAvailable` / `taken`
/ `exists` / `registered` defensively.

**Q5 — Does it count an unpublished order as taken?**
We were told an unpublished site still exists as an active order. Confirming the endpoint reads
orders rather than published sites matters, because that is the whole reason we need it: our
fallback probe only sees published sites and therefore misses about four in five taken names.

## Already settled — no need to answer these

- ✅ **The path is confirmed and the request shape is correct** — `GET`, singular `domainName`,
  a full domain rather than a stem. The endpoint's own `INVALID_DOMAIN` validation proves it is
  parsing our input.
- ✅ **The auth header is `Authorization`, carrying the partner token raw.** No `Bearer` prefix
  (that returns "Hosting server not found") and not `x-auth-token` (that returns `401`).
- ✅ **`POST api.titan.email/fa/mail/login` works** and returns a session — but that session is
  *not* the credential this route wants, which is what sent us down the wrong path initially.
- ✅ **The path is `/internal/neo/check-domain-availability`** — no `v2`.
- ✅ **The parameter is `domainName`** (or `domainNames`). The API named it in its own 400 body.
- ✅ **Our side degrades safely.** Any failure falls back to the HTTP probe, and the reveal still
  renders the `.co.site` option as free with no availability claim. Nothing is broken while this
  is unresolved.

### One documentation mismatch, in case it affects other integrators

The docs show `"session": "eyJhbGciOi..."`, i.e. a JWT. A real Partner Panel login returns an
**opaque single-segment token** (`1:…`, 34 characters), and the response carries **no expiry
field of any kind** — so callers cannot know the session TTL. We cache for 30 minutes and rely
on re-authenticating when a `401` comes back.

---

*Reproducible with curl from any public host. bll request IDs available on request.*

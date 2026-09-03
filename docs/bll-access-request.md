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
```

## What we need

**Q1 — Why does the handler return `500` for every valid domain?**
`flockmail-bll.flock-staging.com`, `GET`, partner token `p_54:…`, `?domainName=foo.co.site`.
Request IDs above. The domain-format validation works (`INVALID_DOMAIN` on a bare stem), so we
are past every layer we can influence. *This is now the only blocker.*

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

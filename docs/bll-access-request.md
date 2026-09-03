# Reaching `check-domain-availability` on bll — access request

**Tested:** 03 Sep 2026 · **Host:** `bll.titan.email` · **Caller:** Vercel serverless function,
public internet · **Project:** Find My Neo (Ignite 2026)

We need to ask Titan whether a `.co.site` subdomain is already taken. The login works, the route
exists, and we found the correct path and parameter ourselves. It still cannot answer from
outside Titan's network — and one response suggests we are reaching the service *past* its
gateway rather than through it.

**Q1 below is the only real blocker.** Everything else is cheap once it is answered.

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

## bll is healthy — this is not a host-wide outage

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

**4.** Same request, with `Authorization: Bearer <valid session>`
```json
404  {"code":"NOT_FOUND","desc":"Hosting server not found"}
```
Past the auth gate, now failing **downstream**. This is where we stopped.

---

## The blocker

### 1. Every domain returns "Hosting server not found" — including ones that certainly exist

```
domainName=titan.email             404  Hosting server not found
domainName=neo.space               404  Hosting server not found
domainName=co.site                 404  Hosting server not found
domainName=proofandbutter.co.site  404  Hosting server not found
```

`titan.email` and `neo.space` are real. So this is a **blanket downstream failure, not an
availability answer**, and we are careful never to read it as "free". It reads like the service
needs to resolve a hosting server per domain and cannot reach whatever it asks.

### 2. This edge is not validating credentials at all

`Authorization: total-garbage-not-a-token` returns a **byte-for-byte identical** response to a
real session. So the header's *presence* passes a gate but its *value* is never checked — which
suggests we are reaching the service **past its gateway** rather than through it.

That is why we stopped. Nothing this endpoint says on this edge is trustworthy, and we did not
want to keep probing an internal service that is not enforcing auth just to learn a response
shape.

> **Worth checking independently of our integration:** should this path be publicly reachable
> at all?

---

## What we need

**Q1 — How should a Vercel serverless function reach this service through its gateway?**
A different base host, an allowlisted route, or a proxy — whichever it is, the answer is a URL
and one credential. *This is the only real blocker; path, parameter and login are all solved.*

**Q2 — What does "Hosting server not found" mean for this endpoint?**
Is it purely a symptom of calling from outside, or does the endpoint need a second internal
service it also cannot see from that edge? *Changes whether Q1 alone is sufficient.*

**Q3 — Which auth header does it actually read, and does the Partner Panel session authorise it?**
Docs say `x-auth-token`; this route says "Auth header missing" when only that is set. We
currently send both, which is a coin flip we would rather not ship. Also: does the session from
`/fa/mail/login` authorise this route, or is `/partner/token/generate` the correct mint — and
what does *that* need? (It returns `401 "Auth header missing"` to both an empty POST and a
Partner Panel session.)

**Q4 — What does a successful response look like, and does `domainNames` take a batch?**
We have never seen a `200`, so we read `available` / `isAvailable` / `taken` / `exists` /
`registered` defensively. A batch parameter would let us check the whole reveal in one call
instead of one per stem.

**Q5 — Should this run on a service credential rather than a human login?**
We currently log in as a Partner Panel user, whose login response shows `is2FAEnabled: false`.
If 2FA is ever enabled on that account, this integration breaks silently. A cold serverless
instance logs in on its first request, so expect login traffic proportional to cold starts.

---

## Already settled — no need to answer these

- ✅ **The login works.** `POST api.titan.email/fa/mail/login` returns `200` with the documented
  payload, including the required `origin: https://app.titan.email` header.
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

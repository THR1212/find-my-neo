# Technical reference

Verified facts and hard-won gotchas. Everything here has a source. If a claim has no source,
it does not belong in this file — put it in `docs/handoff.md` as a lead instead.

## LLM provider

Not Anthropic. GPT-5.6 family, three tiers: Sol (flagship), Terra (balanced), Luna (cheap).

| Model | ID | Input $/1M | Cached $/1M | Output $/1M | Context | Max output |
|---|---|---|---|---|---|---|
| Terra | `gpt-5.6-terra` | $2 | $0.20 | $12 | 1,050,000 | 128,000 |
| Luna | `gpt-5.6-luna` | $0.20 | $0.02 | $1.20 | 1,050,000 | 128,000 |

Source: developers.openai.com model pages, fetched 27 Aug 2026. Terra knowledge cutoff 16 Feb 2026.
Both support Chat Completions, streaming, structured outputs, function calling, prompt caching.
Reasoning effort levels: `none | low | medium (default) | high | xhigh | max`.

**Default: Terra.** It is the A/B-proven model in `flock-partner-analysis` (19 Jul 2026 —
Terra merged issues correctly where `gpt-5.4-mini` fragmented them). Luna is 10x cheaper and
plausibly sufficient for profile extraction — that is the *cost story for the pitch*, not
something to optimise before the reveal works.

### Gotchas — do not rediscover these

Paid for in `flock-partner-analysis` (its `CLAUDE.md`, "Analyzer" section). All three cost about
an hour each if you hit them cold:

1. **`gpt-5.6-*` rejects `temperature`.** Any value, including `0`. Do not send the parameter.
2. **`max_completion_tokens`, not `max_tokens`.** Sending `max_tokens` is a 400.
3. **Check `finish_reason === "length"` before parsing.** Truncated JSON throws a useless
   `JSON.parse` error that looks like a schema bug and isn't.

Strict structured output shape that works:

```ts
response_format: {
  type: "json_schema",
  json_schema: { name: "profile", strict: true, schema: { /* ... */ } }
}
```

Strict mode requires `additionalProperties: false` and every property listed in `required`.

### Credentials

`flock-partner-analysis` uses an existing "AI summarizer" `OPENAI_API_KEY`. **Ignite credentials
are not a blocker for the PM meeting** — that key would work. It is a shared work key on another
project's billing, so: a handful of demo calls is fine, a load test is not. Mention the reuse
rather than have it surface later.

Not yet needed: the profile/guess step is still fixture-backed and `api/profile.ts` does not
exist. Neo's site generator needs **no key at all**.

For Ignite itself, the squad gets its own LLM plan plus $15 API credit.

## Architecture

```
Browser (Vite/React)
  │
  ├─ /api/neo-site  ─▶ api/_lib/neoSite.ts  ─▶ api.titan.email  (NEO'S OWN GENERATOR)
  │                       └─ on failure: src/data/replay/neo-site.json (a REAL recording)
  │
  ├─ /api/domains   ─▶ api/_lib/domainService.ts ─▶ domscan.net   (key server-side only)
  │     ?name=a,b,c      └─ THREE stems per request; /v1/status bills per REQUEST, so a
  │                         name costs one credit and TLD breadth costs nothing
  │     ?titan=<domain>  ─▶ api/_lib/cositeService.ts ─▶ Partner Panel (admin session)
  │                       └─ "does Neo already hold an order for this name?" ONE call, for
  │                          the name actually on offer. null = could not tell = say nothing
  │                       └─ on failure: no badge, no price — never a wrong one
  │
  ├─ /api/profile   ─▶ api/_lib/profileService.ts ─▶ gpt-5.6-luna   (LIVE)
  ├─ /api/questions ─▶ api/_lib/questionService.ts   (surface wording only)
  ├─ /api/reasons   ─▶ api/_lib/reasonService.ts     (feature "because" clauses)
  ├─ /api/rationale ─▶ api/_lib/rationaleService.ts  (the two lines under the price,
  │                       plus `cheaperStep` — computed from plans.json, NOT by the model)
  ├─ /api/plan      ─▶ api/_lib/planService.ts       (verifies a model tier RAISE)
  │
  └─ Claim ─▶ src/lib/checkout.ts ─▶ Checkout.tsx ─▶ Success.tsx
                  NO network calls. The cart is built from the recommendation ON SCREEN,
                  so a swapped-to-cheaper plan carries. Nothing here can create an order.
```

**Both `/api/*` routes run on the Vercel Edge runtime**, declared explicitly. They are written
against the Web API (`Request`/`Response`); the default Node runtime passes a bare path in
`req.url` and `new URL()` throws `ERR_INVALID_URL`. This cannot be reproduced locally — the Vite
dev middleware hands over a different request object — so deploy and hit the real endpoint before
believing an API works.

**Everything degrades, nothing blocks.** Each external call has a defined failure path, and where
the fallback could mislead we say so on screen ("offline — recorded earlier").

**The site content is Neo's, not ours.** We stopped drafting site copy entirely. See
`docs/neo-product-facts.md` for the three-call pipeline and its gotchas.

**Replay mode** (`VITE_LLM_MODE=replay`) serves the recorded fixture instantly. Nothing in the
flow is fixture-backed any more — every model step is live — so this is now a rehearsal setting
for walking the demo without spending tokens, not a gap. Live mode (`VITE_LLM_MODE=live` plus
server `LLM_MODE` / `LLM_API_KEY`) calls the model. If that call cannot run, the guess is
derived from the description — not left blank, and not swapped for the bakery fixture.

## Deterministic plan mapping

The model emits a profile object. `src/lib/rules.ts` maps profile → plan. Pricing lives in
`src/data/plans.json`. The model never sees a price and never picks a plan. This is a hard rule,
not a preference — it is also the answer when someone asks "what if it hallucinates a price".

`recommend()` accepts an `override` that can only ever raise a tier, and only from a verdict the
server already verified. Taking the **cheaper** plan is a different mechanism on purpose:
`priceAs()` prices an explicit pair with no floor check, and it exists because the guard is about
the MODEL going below the solved floor, not about a person choosing to spend less on their own
business. Widening the guard would have handed the model that authority as a side effect.

## Neo environments

| | Website | Signup app |
|---|---|---|
| Staging | `neo.space/?env=staging` | `join-staging.neo.space` |
| Preprod | `neo.space/?env=preprod` | `join-preprod.neo.space` |
| Production | `neo.space` | `join.neo.space` |

- Staging is the only isolated tier (staging BLL/Medusa, Stripe test keys).
- **Preprod uses LIVE Stripe keys.** Never demo there.
- Sourced from handoff §5 (Confluence `TE/375586959`) — **not independently verified.**
  Treat the preprod warning as true regardless; it is the conservative reading.

## Ruled out

Closed decisions. Reopen only with a reason that is not "it might look cooler".

- **Unity WebGL** — 10–30MB builds, won't embed, unlearnable on this timeline.
- **three.js** — ~600KB, and the reveal is a typography-and-timing problem, not a 3D one.
  Framer Motion staggered children plus a CSS 3D card flip beats a rushed WebGL scene when the
  thing being animated is *words*. Spend visual budget on an animated CSS/SVG gradient backdrop
  and good easing instead.
- **gRPC** — no native browser support; needs grpc-web plus an Envoy proxy.
- **WebSockets** — the flow is turn-based request/response; adds connection state, fights serverless.

## Domain availability and pricing

**DomScan**, via our own `/api/domains`. Key is server-side only, in `.env.local`.

RDAP (`rdap.org`) was built first and removed: DomScan's `/v1/status` is RDAP-backed anyway
(`source: "rdap"`), costs 1 credit regardless of how many TLDs you batch, and returns
availability *and* pricing through one integration.

**Credit model — read before touching any query string.** From DomScan's own OpenAPI spec:

| Endpoint | Cost |
|---|---|
| `/v1/status?name=X&tlds=a,b,c` | 1 per request — TLD count is free, so always batch |
| `/v1/prices` **unfiltered** | 1 per TLD × registrar — fans out across ~25 registrars |
| `/v1/prices?registrars=porkbun` | 1 per TLD |
| `/v1/rdap` | 2 — worse than `/v1/status` for us |
| `/v1/tlds`, `/v1/credits` | 0 |

An unfiltered `?tlds=com,in,co` cost **78 credits** in testing. Always send `registrars=`.
With that filter plus caching: cold 4 credits, new business 1, repeat 0.

**The prices are NOT Neo's.** They are a third-party registrar's USD list price converted at a
hardcoded 95 INR/USD. Labelled "approx" on screen. The right source is Neo's own domain search
API, which needs function-head approval.

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
  │                       └─ on failure: no badge, no price — never a wrong one
  │
  └─ buildProfile   ─▶ src/lib/api.ts
                          ├─ replay (default) → src/data/replay/demo.json
                          └─ live             → /api/profile  ← NOT BUILT YET
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

**Replay mode** (`VITE_LLM_MODE=replay`, the default) still covers the profile/guess step, which
is the one part not yet live.

## Deterministic plan mapping

The model emits a profile object. `src/lib/rules.ts` maps profile → plan. Pricing lives in
`src/data/plans.json`. The model never sees a price and never picks a plan. This is a hard rule,
not a preference — it is also the answer when someone asks "what if it hallucinates a price".

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
hardcoded 88 INR/USD. Labelled "approx" on screen. The right source is Neo's own domain search
API, which needs function-head approval.

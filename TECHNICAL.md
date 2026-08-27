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

`flock-partner-analysis` uses an existing "AI summarizer" `OPENAI_API_KEY`. That key works for
tomorrow's demo — **Ignite credentials are not a blocker for the PM meeting.** It is a shared
work key on another project's billing, so: a handful of demo calls is fine, a load test is not.
Mention the reuse to the PM rather than have it surface later.

For Ignite itself, the squad gets its own LLM plan plus $15 API credit.

## Architecture

```
Browser (Vite/React)  ──POST──▶  api/*.ts (Vercel function)  ──▶  api/_lib/llm.ts
                                                                    ├─ replay → src/data/replay/*.json
                                                                    └─ live   → chat.completions
```

The key never reaches the browser. Every model call goes through `complete()` in
`api/_lib/llm.ts` — one function, so swapping provider or endpoint is a local change.

**Replay mode** (`LLM_MODE=replay`, the default) serves committed fixtures with a fake latency so
it still feels like a real call. This is the demo path. Rationale: the reveal is the money shot,
Ignite provides no hosting, and venue wifi is not a dependency worth accepting.

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

## Domain availability

RDAP: `https://rdap.org/domain/<name>` — free, no auth, registry standard.
Caveat: tells you whether a domain is registered globally, **not** whether Neo sells that TLD.
Neo's own domain search API would be better if granted. Not needed for the PM demo.

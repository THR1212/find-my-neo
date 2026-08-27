# Neo Akinator — project invariants

Ignite 2026 hackathon build (02–04 Sep 2026, Open Field category).

**This file is the only thing in the repo that is binding.** `docs/handoff.md` is background —
it came out of an exploratory chat, much of it is explicitly unverified (see its §11), and parts
of it are stale or wrong. Treat it as a lead list, not a spec. Where it conflicts with this file,
this file wins. Where it makes a factual claim that matters, verify it before building on it.
The design is still open; nothing below is settled because the handoff said so — it's here because
we decided it.

## What this is

An adaptive 5-question quiz that lives on Neo's pricing page as a full-screen overlay.
User describes their business in free text → we profile them → we reveal a personalised
setup (available domain, mailbox names, draft site copy) → one CTA into Neo's purchase flow.

**Generative and pre-purchase.** Not a decision tree, not post-purchase analytics.

## Hard rules

1. **"Akinator" is a trademark.** Internal shorthand only. It must never appear in demo-visible
   copy, the deck, the deployed page title, or the URL. Shipped name: see `docs/naming.md`.
2. **The LLM never decides price or plan.** It emits a structured profile object only.
   `src/lib/rules.ts` maps profile → plan deterministically. Pricing lives in `src/data/plans.json`.
3. **No API key ever reaches the browser.** All model calls go through `api/*` serverless functions.
4. **The reveal must work with the network off.** Every LLM call goes through the provider seam in
   `api/_lib/llm.ts`, which has a replay mode. Demo runs in replay. See "Replay mode" below.
5. **Never create real orders and never script traffic at Neo's production domain search.**
   Handoff is a user-clicked link, never a silent redirect.
6. **Preprod uses live Stripe keys.** Never demo against `join-preprod.neo.space`.
   Staging (`join-staging.neo.space`) is the only isolated tier.

## The one screen that must be perfect

The reveal (screen 5). Available domain, mailbox names, draft site copy, materialising line by line.
Everything else can be rough. Budget prompt-iteration time on screen 2 (the "guess") and screen 5 only.

## Flow (fixed — do not add screens)

1. Hook — "Not sure which plan? Answer 5 questions" on the pricing page
2. Free text — "What's your business?"
3. The guess — model reflects back an inferred profile, binary confirm/deny
4. Two taps — import intent, then mail-only vs mail+site
5. The reveal

Option sets on screens 3–4 should reuse Neo's real persona survey values rather than invented ones —
continuity with existing data is a pitch asset. The values transcribed in handoff §4 are a starting
point recovered from response data, not an official question bank; re-check them against the source
sheet before they go on screen.

Design for 1–3 person businesses. No 50–200 employee branch.

## Latency plan

- Screen-1 submit fires the profile call immediately.
- Reveal content (domain candidates, mailbox names, site copy) is generated **during** screens 3–4
  while the user is tapping. State is a single session object (`src/lib/session.ts`), not per-screen.
- Optimistic UI: animate the transition on click, resolve the call underneath.

## Replay mode

`LLM_MODE=replay` (default in `.env.example`) serves pre-recorded responses from
`src/data/replay/` instantly. This is the demo path, the rehearsal loop, and the prompt-iteration
harness. `LLM_MODE=live` calls the real provider. Both go through the same seam — a screen must
never know which one it got.

## Stack

React + Vite + TS · Framer Motion · Vercel serverless functions · hardcoded plan JSON.
Ruled out and not to be revisited: gRPC, WebSockets, Unity WebGL, three.js.
Domain availability: RDAP (`rdap.org/domain/<name>`), free, no auth.

## LLM

Provider is **not Anthropic** — Ignite supplies the plan. Model ID lives in `LLM_MODEL` env var,
never hardcoded. Do not invoke the `claude-api` skill for this project.

## Schedule

Feature freeze at **hour 36**. The last 4 hours are ring-fenced for the pitch: narrative, demo
script, measurement slide. That is not leftover time.

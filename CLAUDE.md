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

1. **Shipped name is "Find My Neo"** — defined once in `src/lib/brand.ts` as `PRODUCT_NAME`,
   never hardcoded in a component. "Akinator" is a trademark (Elokence SAS): internal shorthand
   and repo name only, never on screen, in the deck, or in a page title. See `docs/naming.md`.
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

Provider is **not Anthropic** — it is GPT-5.6 (`gpt-5.6-terra` default, `gpt-5.6-luna` as the
cheap tier). Model ID lives in `LLM_MODEL`, never hardcoded outside `api/_lib/llm.ts`.

**Do not invoke the `claude-api` skill for this project** — it refuses non-Anthropic work and
will try to steer the code back to the Anthropic SDK.

Three gotchas that will cost an hour each if rediscovered: no `temperature` param at all,
`max_completion_tokens` not `max_tokens`, and check `finish_reason === "length"` before parsing.
Full detail and sources in `TECHNICAL.md`.

## CURRENT STATE

_Last updated: 27 Aug 2026._

**Done**
- Vite + React + TS scaffold, Framer Motion / openai / zod installed
- `api/_lib/llm.ts` — provider seam with replay mode, gpt-5.6 gotchas baked in
- `api/_lib/replay.ts` — fixture loader with fake latency
- `TECHNICAL.md` — verified model facts, pricing, architecture, ruled-out decisions
- `.env.example`, `.gitignore`, git initialised
- Private GitHub repo: https://github.com/THR1212/neo-akinator (default branch `master`)
- `src/lib/brand.ts` — `PRODUCT_NAME = "Find My Neo"`, `docs/naming.md` written

**Not done / next**
- Screen 1 and the reveal screen. Nothing in `src/` is real yet — still Vite boilerplate.
- No fixtures in `src/data/replay/` yet. Nothing will run in replay mode until there is one.
- `src/data/plans.json`, `src/lib/rules.ts`, `src/lib/session.ts` — referenced, not written.
- Python `analysis/` folder for the persona/retention work — not started.

**Open questions (not blockers for milestone 1)**
- Squad registration status for Ignite (deadline was 21 Aug noon, unconfirmed).
- Whether the Neo KR1 persona bullet has entered design/PM phase — this is the
  disqualification risk. The PM meeting is the natural place to ask directly.
- Whether Neo's real persona question bank matches what handoff §4 reconstructed.

## Two milestones — do not confuse them

**Milestone 1 — PM viability demo, 28 Aug 2026.** A short, local, look-and-feel demo to show the
product team what the idea is and how it would feel. Not a hackathon deliverable. Runs on
`npm run dev` off replay fixtures. No Vercel, no deploy, no real purchase flow, no funnel.
The only question it has to answer is: *does the reveal make a PM say "yes, build this"?*

**Milestone 2 — Ignite 2026, 02–04 Sep 2026.** The 48-hour build. Feature freeze at **hour 36**;
the last 4 hours are ring-fenced for the pitch narrative, demo script, and measurement slide.
That is not leftover time. Vercel deploy, the handoff link, and the funnel belong here.

## Scope for milestone 1 (build in this order, stop when the reveal is beautiful)

1. Screen 1 (free-text box) → Screen 5 (the reveal). **Skip screens 2, 3 and 4 entirely** —
   they narrate as "and then two more taps". The generative reveal is the whole pitch.
2. Reveal runs off a committed fixture for a scripted input. Live call is a bonus, not a goal.
3. Hardcode one plan. No rules table, no RDAP, no handoff link. The CTA can be a dead button.

## Schedule

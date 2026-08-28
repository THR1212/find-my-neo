# Neo Akinator — project invariants

Ignite 2026 hackathon build (02–04 Sep 2026, Open Field category).

**This file is the only thing in the repo that is binding.** `docs/handoff.md` is background —
it came out of an exploratory chat, much of it is explicitly unverified (see its §11), and parts
of it are stale or wrong. Treat it as a lead list, not a spec. Where it conflicts with this file,
this file wins. Where it makes a factual claim that matters, verify it before building on it.
The design is still open; nothing below is settled because the handoff said so — it's here because
we decided it.

## What this is

An adaptive quiz on Neo's pricing page. User describes their business in free text → we build a
persona → we land them on the right domain (with priced alternates), mailbox plan and site plan
→ they claim it, pay, and **finish the site in Neo's existing AI builder**.

**We are a qualifier, not a site builder — and not a new funnel.** Neo already generates sites
(`neo.space/ai-website-builder`, live, one-page, 130,000+ businesses) **and that builder is
already their purchase flow** — it lands in `join.neo.space` with `source_hook=purchaseFlow`.

So the accurate claim is: we enter Neo's existing funnel **earlier and pre-qualified** — domain
chosen, mailbox count known, plan fitted — instead of at the category picker. Never say we're
adding a purchase path; they have one. See `docs/neo-product-facts.md` before making any claim
about what Neo does.

Generative and pre-purchase. Not a decision tree, not post-purchase analytics.

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

## Flow — adaptive, not a fixed screen order

1. Hook — on the pricing page, opens a full-screen overlay
2. Free text — "What's your business?" (the only real input, and what justifies an LLM)
3. The guess — profile reflected back, confirm or correct
4. **Adaptive questions** — the engine asks whichever unresolved signal narrows most.
   The model *suggests* which to ask next; `engine.ts` overrules it if that signal is already
   resolved or the id isn't real. Stops when confident, or at 4. Different businesses get
   different paths.
5. The reveal — domain with priced alternates, mailboxes, drafted site, why-this-plan features

**Do not reintroduce a fixed screen order.** The adaptivity is the product.
The narrowing meter (5,318 → single digits) is the gamification and must stay visible throughout.

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
Domain availability + indicative pricing: **DomScan**, via our own `/api/domains`. Key is
server-side only. RDAP was built first and removed — see DECISIONS. **Watch the credits:**
`/v1/prices` bills per TLD × registrar pair, so it always needs a `registrars=` filter.

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

_Repositioned 27 Aug after walking Neo's live AI builder. Read `docs/neo-product-facts.md` first._

**Done**
- Vite + React + TS scaffold, Framer Motion / openai / zod installed
- `api/_lib/llm.ts` — provider seam with replay mode, gpt-5.6 gotchas baked in
- `api/_lib/replay.ts` — fixture loader with fake latency
- `TECHNICAL.md` — verified model facts, pricing, architecture, ruled-out decisions
- `.env.example`, `.gitignore`, git initialised
- Private GitHub repo: https://github.com/THR1212/neo-akinator (default branch `master`)
- `src/lib/brand.ts` — `PRODUCT_NAME = "Find My Neo"`, `docs/naming.md` written

- Full flow built and verified in a real browser: real clipboard paste + Enter,
  1440×820 laptop (fits, no scrollbar), 390×844 mobile (no horizontal overflow)
- **Adaptive engine** — `src/lib/questions.ts` (6-question bank) + `src/lib/engine.ts`
  (picks next question, confidence, narrowing counter, confidence-based stopping)
- **Narrowing meter** — 5,318 → single digits, verified live
- **Neo brand reskin** — Poppins, `#0066FF`, white, brand gradient; `src/styles/neo-tokens.css`
- **DomScan domain lookup** — live availability + indicative price, credit-aware caching
  (cold 4 credits / new business 1 / repeat 0), Vite middleware mirrors the Vercel function
- **Feature highlights** — `src/lib/features.ts`, deterministic, allow-listed against
  `docs/neo-product-facts.md`
- `docs/neo-product-facts.md` — verified Neo behaviour from Confluence `NP/698843154` + live walk
- `docs/demo-script.md` — rewritten around the repositioning
- `src/data/replay/demo.json` — hand-written demo fixture (Proof & Butter bakery)
- `README.md` (plain English, no frontend knowledge assumed), `DECISIONS.md`,
  `docs/demo-script.md` (run sheet + objections + the actual ask)
- Vercel: project `hari-7720/neo-akinator`, deployed, GitHub auto-deploy connected

**Not done / next**
- **Prices are blank.** `src/data/plans.json` has `priceInr: null`, so the plan name renders
  without a price. Deliberate — see DECISIONS.md. Fill in real numbers to show it.
- `src/lib/rules.ts` — the profile→plan rules table. For milestone 1 it is one boolean
  inlined in `Reveal.tsx`; extract it for Ignite.
- Sound cues (advance, reveal tick, CTA). Must ship muted-by-default with a visible toggle.
- Live mode is written but never exercised against the real API. Verify the call shape in
  hour 1 of Ignite, not at hour 30.
- Python `analysis/` folder for the persona/retention work — not started.
- Deployment Protection is ON. Share via a **Shareable Link** (deployment page → Share), not the
  bare URL — the bare URL hits a Vercel login wall. Sent to Moin/Darrel 27 Aug.
- Mailbox + site pricing now sourced from Neo's own sheet into `src/data/plans.json`, but the
  reveal still renders no plan price — wiring it in is outstanding.
- Handoff into Neo's funnel — not built. Their builder takes Business name (55) +
  About the business (2000); we produce both. That's the integration point.

**Open questions**
- Squad registration status for Ignite (deadline was 21 Aug noon, unconfirmed).
- Whether the Neo KR1 persona bullet has entered design/PM phase — the disqualification risk.
  Ask directly in the PM meeting.
_(Both resolved 28 Aug — see `docs/neo-product-facts.md`. The free domain is the `.co.site`
subdomain; domain is upsold right after design selection and mail is upsold inside the editor
at ₹100/mo.)_
- `Spec: Site offering` (`NP/787382478`) describes a site upsell flow with plan selection —
  read before claiming our recommendation flow is novel.

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

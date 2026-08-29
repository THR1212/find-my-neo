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
4. **Every external call must degrade, never block.** Three of them now: the LLM (`api/_lib/llm.ts`,
   replay mode), Neo's site generator (`api/_lib/neoSite.ts`, falls back to a *recorded real*
   response), and DomScan (`api/_lib/domainService.ts`, renders no badge rather than a wrong one).
   A screen must never know which path it got — except where honesty requires it, e.g. the site
   card says "offline — recorded earlier" when the live call failed.
5. **Never create real orders and never script traffic at Neo's production domain search.**
   Handoff is a user-clicked link, never a silent redirect.
6. **Preprod uses live Stripe keys.** Never demo against `join-preprod.neo.space`.
   Staging (`join-staging.neo.space`) is the only isolated tier.

## The one screen that must be perfect

The reveal. Available domain with priced alternates, mailboxes, **Neo's own generated site**, and
the plan quietly underneath — materialising line by line. Everything else can be rough.
Budget prompt-iteration time on the guess screen and the reveal only.

## Flow — adaptive, not a fixed screen order

1. Hook — on the pricing page, opens a full-screen overlay
2. Free text — "What's your business?" (the only real input, and what justifies an LLM)
3. The guess — profile reflected back, confirm or correct
4. **Adaptive questions** — the engine asks whichever unresolved signal narrows most.
   The model *suggests* which to ask next; `engine.ts` overrules it if that signal is already
   resolved or the id isn't real. Stops when confident, or at 4. Different businesses get
   different paths.
5. The reveal — domain with priced alternates, mailboxes, **Neo's own generated site**,
   why-this-plan features, and the plan + real price quietly underneath

**Do not reintroduce a fixed screen order.** The adaptivity is the product.
The narrowing meter (5,318 → single digits) is the gamification and must stay visible throughout.

Option sets on screens 3–4 should reuse Neo's real persona survey values rather than invented ones —
continuity with existing data is a pitch asset. The values transcribed in handoff §4 are a starting
point recovered from response data, not an official question bank; re-check them against the source
sheet before they go on screen.

Design for 1–3 person businesses. No 50–200 employee branch.

## Latency plan

- Screen-1 submit fires **both** the profile call and Neo's site generator immediately, in
  parallel, and advances without awaiting either.
- **Neo's generator takes 22–38 seconds** — measured repeatedly, and by far the slowest thing in
  the flow. The questions only occupy ~15–20s, so a visible wait remains: `NeoSiteGenerating.tsx`
  covers it with Neo's own 12-step loader copy. Do not move this call later.
- Domain availability resolves on arrival at the reveal and corrects the optimistic first paint.
- Optimistic UI: animate the transition on click, resolve the call underneath.

## Replay mode

`LLM_MODE=replay` (default in `.env.example`) serves pre-recorded responses from
`src/data/replay/` instantly. This is the demo path, the rehearsal loop, and the prompt-iteration
harness. `LLM_MODE=live` calls the real provider. Both go through the same seam — a screen must
never know which one it got.

## Stack

React + Vite + TS · Framer Motion · Vercel **Edge** functions · plan data from Neo's own sheet.
Ruled out and not to be revisited: gRPC, WebSockets, Unity WebGL, three.js.

**Vercel functions must declare `runtime: "edge"`.** They are written against the Web API
(`Request`/`Response`); the default Node runtime passes a bare path in `req.url` and
`new URL()` throws. This cannot be caught locally — the Vite dev middleware hands over a
different request object. Deploy and hit the real endpoint before believing an API works.

**Site content comes from Neo, not us.** `api/_lib/neoSite.ts` calls their real generator.
We do not write site copy. See `docs/neo-product-facts.md` for the API shape and its gotchas
(`crid` required on the image endpoint too; `sq` capped at 10; `p` is a JSON string).
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

_Last updated: 28 Aug 2026. Repositioned 27 Aug after walking Neo's live builder —
read `docs/neo-product-facts.md` before claiming anything about what Neo does._

**Working, live, and verified in production**
- Full adaptive flow: hook → free text → guess → up to 4 engine-chosen questions → reveal.
  Verified in a real browser (clipboard paste, 1440×820 laptop, 390×844 mobile).
- **Adaptive engine** — `src/lib/questions.ts` (6-question bank) + `src/lib/engine.ts`
  (next question, confidence, narrowing counter, confidence-based early stop).
- **Narrowing meter** — 5,318 → single digits.
- **Neo's real site generator** — `api/_lib/neoSite.ts` calls Neo's own API
  (`t:"bi"` → `t:"sc"` → image search). We render THEIR content, not our copy.
  Live in production: `source: live`, 19–20/20 images resolved. Falls back to a *recorded real*
  response and says so on the card.
- **Generating state** — `src/components/NeoSiteGenerating.tsx`, Neo's own 12-step loader copy.
  Their generator takes 22–38s; this is not optional.
- **Live domain lookup** — DomScan via `/api/domains`, credit-aware caching
  (cold 4 / new business 1 / repeat 0 credits).
- **Real Neo pricing** — `src/data/plans.json` from Neo's own sheet; `src/lib/rules.ts` maps
  profile → plan deterministically. Reveal shows e.g. "Neo Starter + Basic site ₹567/mo".
- **Feature highlights** — `src/lib/features.ts`, names taken verbatim from Neo's own
  catalogue (`static.flock.co/meta/plan/feature/config/en-US.json`).
- **Neo brand skin** — Poppins, `#0066FF`, white, brand gradient.
- Vercel project `hari-7720/find-my-neo`, GitHub auto-deploy connected, both API routes on the
  **Edge runtime** (required — see DECISIONS).
- Repo: https://github.com/THR1212/neo-akinator (branch `master`).

**Not done / next**
- **The LLM profile call is still fixture-backed.** `VITE_LLM_MODE=replay` is the default and
  `api/profile.ts` does not exist. Going live needs that endpoint plus an OpenAI key. Everything
  else in the flow is live. This is the biggest remaining gap.
- **Handoff not wired.** `src/lib/handoff.ts` builds the URL but the CTA is still inert.
  Neo's funnel takes plain query params (`bn`, `bd`) — no new API needed.
- **Design chooser.** Neo offers three variants; we call once and show one.
- Sound cues — must ship muted-by-default with a visible toggle.
- Python `analysis/` folder for the persona/retention numbers — not started.
- Screen recordings and HARs live in `neo_flows/` and are **gitignored** (~100MB, contain
  session tokens and the tester's email). Findings go in `docs/neo-product-facts.md`.

**Sharing the deployment**
Deployment Protection is ON. Use a **Shareable Link** (deployment page → Share), not the bare
URL — the bare URL hits a Vercel login wall. Current link is in the outreach message to
Moin/Darrel. Also: `neo-akinator.vercel.app` regenerates on every prod deploy and must be
removed each time (trademarked name).

**Open questions**
- Squad registration status for Ignite (deadline was 21 Aug noon, unconfirmed).
- Whether the Neo KR1 persona bullet (`NP/1697185794`) has entered design/PM phase — the
  disqualification risk. Ask directly on Monday.
- `Spec: Site offering` (`NP/787382478`) describes a site upsell flow *with plan selection* —
  read before claiming our recommendation flow is novel.

_Resolved 28 Aug: the free domain is the `.co.site` subdomain; domain is upsold immediately
after design selection and mail is upsold inside the editor at ₹100/mo; the signup gate falls
after generation and before the editor._

## Two milestones — do not confuse them

**Milestone 1 — PM viability demo, 28 Aug 2026.** A short, local, look-and-feel demo to show the
product team what the idea is and how it would feel. Not a hackathon deliverable. Runs on
`npm run dev` off replay fixtures. No Vercel, no deploy, no real purchase flow, no funnel.
The only question it has to answer is: *does the reveal make a PM say "yes, build this"?*

**Milestone 2 — Ignite 2026, 02–04 Sep 2026.** The 48-hour build. Feature freeze at **hour 36**;
the last 4 hours are ring-fenced for the pitch narrative, demo script, and measurement slide.
That is not leftover time. Vercel deploy, the handoff link, and the funnel belong here.

## Scope for milestone 1 — SUPERSEDED, kept for the reasoning only

The original 28 Aug plan was: build screen 1 and the reveal, skip the middles, hardcode one
plan, dead CTA, everything off fixtures. That was correct for a one-day viability check.

**It has all been overtaken.** The demo was postponed to Monday and the extra days went into:
the adaptive engine (so the middles are the product, not filler), real Neo pricing plus
`rules.ts`, live domain lookup, and Neo's own generator wired in live.

What survives from that plan is the priority order, and it still holds:
**the reveal is the pitch — everything else can be rough.**

Still genuinely not built: the handoff CTA is inert, and the profile/guess step is fixture-backed.

## Schedule

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
2. **The LLM never emits a price, and may only ever RAISE a plan — with a checked reason.**
   Rewritten 03 Sep, when `api/plan.ts` gave the model a say for the first time. `rules.ts`
   still computes the recommendation deterministically from Pandora entitlements; the model
   may raise a tier only by citing an entitlement (an enum, so it cannot be invented) and
   quoting words the server finds in what the person actually wrote. It may never lower a
   tier, never contradict an option someone tapped, and never produce a number — the floor
   for each entitlement is looked up in our table, not taken from the model. Fail any check
   and the deterministic answer stands. What it emits otherwise is a structured profile only.
   `src/lib/rules.ts` maps profile → plan deterministically. Pricing lives in `src/data/plans.json`.
   Same for features: `src/lib/features.ts` is a fixed bank using Neo's own verbatim names.
   **The pricing sheet is not the offering.** Neo Lite is in the sheet and Neo does not sell it;
   we recommended it, with a real price, until 03 Sep. Check a plan is purchasable before
   `rules.ts` can return it. Mail feature names come from Neo's JSON config; **site feature
   names have no config** and are captured in `src/data/site-features.json` — re-read the live
   page before quoting a site limit.
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
4. **Adaptive questions** — the model returns `questionPriority` (all eight ids, ranked for this
   business) and `prefill` (signals the free text already answered). `engine.ts` consumes the
   ranking head-first for the WHOLE flow and re-checks every id against what is unresolved.
   Stops when nothing left to ask could change the recommendation. `MAX_QUESTIONS = 12` is a
   ceiling that should never bind — the bank holds **eight** questions and a clear-cut business
   finishes in five. Different businesses genuinely get different paths, and the ranking is
   arithmetic: `discrimination()` scores what each question would actually narrow, and the
   model's ordering only breaks ties. **It used to be an override**, which made the scoring
   dead code in production; see DECISIONS 03 Sep.
   **Never prefill `mailboxCount`** — free text offers headcount, which is not an address count.
   Questions are **multi-select where the world is** (`question.multi`) and most carry a
   **free-text box**. Free text alone resolves the signal — someone who types instead of
   picking has still answered.
5. The reveal — domain with priced alternates, mailboxes, **Neo's own generated site**,
   why-this-plan features, and the plan + real price quietly underneath

**Do not reintroduce a fixed screen order.** The adaptivity is the product.

The narrowing meter shows **words, not a count** (03 Sep). The "possible setups" number is off
screen: `confidence()` still drives the early stop, and `remainingSetups()` is still computed,
but neither is a design input any more. Do not reason about pacing from the counter.

**Never compare a profile value with `===`.** Multi-select means a value may be an array; use
`has()` from `engine.ts`. A direct equality check silently stops matching and nothing fails
loudly to tell you.

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

**Runtime is per-route, and getting it wrong breaks the deploy, not the build.**

`api/domains`, `api/neo-site`, `api/log` are **Edge**: written against the Web API
(`Request`/`Response`), and the default Node runtime passes a bare path in `req.url` so
`new URL()` throws. Cannot be caught locally — Vite's dev middleware hands over a different
request object.

`api/profile` is **Node** (`runtime: "nodejs"`, not `"nodejs20.x"` — the suffixed form is
rejected). It reaches the OpenAI SDK and, in replay mode, the filesystem; neither exists on
Edge, and putting it there failed **every production deploy** with
`The Edge Function "api/domains" is referencing unsupported modules: node:fs/promises,
openai: #x509-transport-state`. Two lessons in that: Vercel bundles Edge functions into one
shared namespace, so **the function it blames is not the function at fault**; and the check
runs at "Deploying outputs", AFTER the build, so `npm run build` and even a local
`vercel build` both report success. **Only a real deploy catches it — `npx vercel deploy`
before believing an API route works.**

`api/` is typechecked via `api/tsconfig.json`, referenced from the root. Before that it was
invisible: `tsconfig.app` covers only `src/`, `tsconfig.node` only `vite.config.ts`, so api/
errors reached Vercel unseen.

**Site content comes from Neo, not us.** `api/_lib/neoSite.ts` calls their real generator.
We do not write site copy. See `docs/neo-product-facts.md` for the API shape and its gotchas
(`crid` required on the image endpoint too; `sq` capped at 10; `p` is a JSON string).
Domain availability + indicative pricing: **DomScan**, via our own `/api/domains`. Key is
server-side only. RDAP was built first and removed — see DECISIONS. **Watch the credits:**
`/v1/prices` bills per TLD × registrar pair, so it always needs a `registrars=` filter.

**`.co.site` does not go to DomScan.** It is Neo's own namespace, not a registrable TLD, so
DomScan answers about `co.site` itself — which is registered, i.e. a confident "taken" for
every stem. `api/_lib/cositeService.ts` handles it, inside the same `/api/domains` response,
exempt from `MAX_TLDS` because it costs no credit. Without `NEO_COSITE_CHECK_URL` set, its
fallback can prove a name is **taken** but never that it is **free** — `*.co.site` is a DNS
wildcard and an unpublished-but-claimed name 404s like an unclaimed one. Do not "fix" that by
reading 404 as available. See DECISIONS 2026-09-03.

The reveal shows **four** domains: three registrable, plus `.co.site` in a reserved last slot
labelled Free. `.co.site` must never take the hero slot — including when the DomScan lookup
fails, which is where the obvious ranking gets it wrong.

## LLM

**`docs/llm-flow.md` explains the whole model flow end to end** — what the two calls are, when
they fire, what they may and may not decide, what degrades to what, and what is still
hand-written. Read that before reasoning about the flow; the notes below are the gotchas only.

Provider is **not Anthropic** — it is GPT-5.6 (`gpt-5.6-terra` default, `gpt-5.6-luna` as the
cheap tier). Model ID lives in `LLM_MODEL`, never hardcoded outside `api/_lib/llm.ts`.

**Do not invoke the `claude-api` skill for this project** — it refuses non-Anthropic work and
will try to steer the code back to the Anthropic SDK.

Three gotchas that will cost an hour each if rediscovered: no `temperature` param at all,
`max_completion_tokens` not `max_tokens`, and check `finish_reason === "length"` before parsing.
Full detail and sources in `TECHNICAL.md`.

## CURRENT STATE

_Last updated: 03 Sep 2026 (hackathon day 2). Repositioned 27 Aug after walking Neo's live
builder — read `docs/neo-product-facts.md` before claiming anything about what Neo does._

**Working, live, and verified in production**
- Full adaptive flow: hook → free text → guess → engine-chosen questions (typically 5, ceiling 12) → reveal.
  Verified in a real browser (clipboard paste, 1440×820 laptop, 390×844 mobile).
- **Adaptive engine** — `src/lib/questions.ts` (**8**-question bank; `client` was measured out
  on 03 Sep — four options, one plan outcome, and it changed nothing the reveal showed) +
  `src/lib/engine.ts`
  (next question, discrimination scoring, stop-when-nothing-narrows). **The confidence
  backstop was removed 03 Sep** — it silenced a question that could still change the price,
  and a threshold that can do that is a bug, not a backstop. `confidence()` survives only to
  drive the meter ring.
  **Weights are now data-derived** (Darrel, 02 Sep): `mailboxCount` leads at 0.3 because it
  multiplies price; the old import-first order was retired as a selection effect. Do not
  re-tune weights by feel — `docs/data-findings.md` §1c and §8 are the reason they are what
  they are.
- **Generated question wording** — the model rewrites all eight questions for the business
  someone typed: prompt, sub-line, placeholder, option labels and hints. Three layers, and
  only the middle one is generated:
  signals + weights fixed · surface text generated · option ids + `resolves` fixed.
  So no generation can change what an answer means, only how it reads.
  **An option describes the CUSTOMER'S situation, never what Neo does.** "Instagram and
  WhatsApp" is a fact about them; "Sell tickets on your site" is a promise we cannot keep.
  Server-side validation drops anything unprovable, and a question left with under 2 usable
  options renders from the fixed bank verbatim — that floor is the safety story.
- **The profile step is live** — `api/profile.ts` + `api/_lib/profileService.ts` on
  **gpt-5.6-luna**, constrained to Titan's 16-industry taxonomy. Nothing in the flow is
  fixture-backed any more.
- **Session persistence** — `src/lib/persist.ts`, sessionStorage, versioned + 2h TTL. A
  refresh keeps the run, the generated wording, and the trail.
- **A trail of what each person saw** — `QuestionTrace` in engine.ts records the prompt and
  labels **as displayed**, with `origin: fixed | generated`. Generated wording makes every
  session different, so without it a bug report is unreproducible.
  **Still only in memory — nothing posts or displays it yet.**
- **Check-your-own-domain** — an input on the reveal runs the same live DomScan lookup and
  appends a fourth option, selected only if DomScan says it is actually free.
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
- **Multi-select questions + per-question free text** — see DECISIONS 31 Aug.
- **Error + degradation reporting** — `/api/log` into Vercel runtime logs. Four layers, incl.
  `reportDegraded` for the silent fallbacks. `npx vercel logs <url>`, grep `[client-error]`.
- **Demo bookmarklet** — `tools/bookmarklet/`, injects our button onto Neo's real pricing page
  and opens the app as an in-page overlay.
- **Neo brand skin** — Poppins, `#0066FF`, white, brand gradient.
- Vercel project `hari-7720/find-my-neo`, GitHub auto-deploy connected, both API routes on the
  **Edge runtime** (required — see DECISIONS).
- Repo: https://github.com/THR1212/find-my-neo (branch `master`).

**Not done / next**
- ~~The LLM profile call is still fixture-backed~~ — **done 02 Sep.** `api/profile.ts` +
  `api/_lib/profileService.ts`, live on gpt-5.6-**luna**. The model is constrained to Titan's
  16-industry taxonomy (docs/data-findings.md §6), so "bakery" resolves to Food & Beverage
  instead of matching nothing. It emits no price, no plan and no mailbox count. On failure it
  degrades to a derived profile rather than erroring.
  **Production needs the env vars set on Vercel** (`LLM_MODE`, `LLM_MODEL`, `LLM_API_KEY`) or
  it will silently serve degraded profiles.
- ~~Design chooser~~ — **done 03 Sep.** `generateNeoSites` classifies once for Neo's own
  `templateKey`, then generates that one AND a deliberately different one in parallel
  (`Promise.allSettled`, duplicate keys dropped), so the pair costs one call's wall-clock. Both
  render side by side on the reveal and are **pickable**; the choice rides to Neo as
  `templateKey`. That param was previously refused on purpose — sending a DERIVED key would
  make us complicit in the taxonomy bug we are pointing at — and a person choosing between two
  of Neo's own outputs is not a guess. Neo picks the template randomly client-side
  (`docs/neo-product-facts.md`); this is the answer to that.

- Sound cues — must ship muted-by-default with a visible toggle.
- ~~Python `analysis/` folder for the persona/retention numbers~~ — **done 02 Sep.**
  `analysis/scripts/` + `analysis/output/`, findings written up in `docs/data-findings.md`.
  5,318 confirmed exactly; the yearly-billing default verified on two datasets; the
  import-first question order retired as a selection effect (DECISIONS 02 Sep). Raw data
  stays in the gitignored `analysis/data/`.
- Screen recordings and HARs live in `neo_flows/` and are **gitignored** (~100MB, contain
  session tokens and the tester's email). Findings go in `docs/neo-product-facts.md`.

**Sharing the deployment**
**Deployment Protection is now OFF** (31 Aug) — the bare URL works for anyone, and that is what
makes the bookmarklet's in-page overlay possible. If it is ever turned back on, also set
`USE_OVERLAY = false` in `tools/bookmarklet/source.js` or the demo shows a dead white overlay
with no way for the script to detect it.

`neo-akinator.vercel.app` regenerates on every prod deploy and must be removed each time
(trademarked name): `npx vercel alias rm neo-akinator.vercel.app --yes`.

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

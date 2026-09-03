# Decision log

Running record of choices made and *why*, newest last. The point is that six months from now —
or on hour 30 of Ignite, or in a different tool — nobody has to re-derive the reasoning or
re-litigate a settled question.

Format: what was decided, why, and what would make it worth reversing.

---

### 2026-08-27 · Stack: React + Vite + TypeScript, not Python

**Why.** Browsers run JavaScript. Python can only ever be the backend, and the backend here is
~150 lines of "take text, call model, return JSON" — splitting languages buys nothing and costs
two toolchains and two dependency managers.

**Reverse if:** never, for the app. Python has a real home in `analysis/` (below).

---

### 2026-08-27 · Python for data analysis, in a separate folder

**Why.** The persona/retention work on `Neo_vs_Non-neo_clients.xlsx` is pandas work: dedupe on
`order_id`, retention cuts, the distinct-industry-strings finding. It runs offline and its output
is *deck numbers*, not app runtime. Keeping it out of the app means it can never break the demo.

**Reverse if:** never. But note it is **not started**, and it is not needed for the 28 Aug demo.

---

### 2026-08-27 · LLM is GPT-5.6, not Claude

**Why.** Ignite provides the LLM plan. Terra (`gpt-5.6-terra`) is the default because it is
already A/B-proven in `flock-partner-analysis`; Luna is 10× cheaper and is the cost story for
the pitch rather than something to optimise now.

Consequence: **do not invoke the `claude-api` skill in this repo.** It refuses non-Anthropic work
and will try to steer code back to the Anthropic SDK.

---

### 2026-08-27 · Model emits a profile; code picks the plan

**Why.** The model never sees a price and never chooses a plan. `plans.json` holds pricing and a
rules table maps profile → plan. This is what makes "what if it hallucinates a price" a
non-question rather than a risk to manage.

**Reverse if:** never. This is the answer to the most predictable objection in the room.

---

### 2026-08-27 · Ruled out: Unity, three.js, gRPC, WebSockets

**Why.** Unity is 10–30MB and won't embed. three.js is ~600KB for 3D geometry we don't need —
the reveal is *text materialising*, a typography-and-timing problem, and well-tuned Framer Motion
beats a rushed WebGL scene when the thing being animated is words. gRPC has no native browser
support. WebSockets add connection state to a turn-based request/response flow.

Visual budget goes to an animated CSS gradient backdrop, generous type, and easing curves instead.

**Reverse if:** the reveal genuinely becomes spatial rather than textual. It hasn't.

---

### 2026-08-27 · Replay mode, built before anything else

**Why.** The reveal is the money shot, Ignite provides no hosting, and venue wifi is not a
dependency worth accepting. `LLM_MODE=replay` serves committed fixtures with a fake delay so it
still *feels* like a real call. Doubles as the rehearsal loop and the prompt-iteration harness.
Cheap as an early interface decision, painful to retrofit at hour 40.

---

### 2026-08-27 · Replay resolves client-side, not through `api/`

**Why.** Tomorrow's demo runs on plain `npm run dev`, where no serverless function exists.
Routing replay through `api/_lib/llm.ts` would require `vercel dev` — one more moving part on
demo morning for zero benefit. So `src/lib/api.ts` imports the fixture directly in replay mode
and POSTs to `/api/profile` only in live mode.

The server path stays intact for Ignite, where a deployed build needs a key that must never reach
the browser. Both paths return the same shape.

---

### 2026-08-27 · One session object, not per-screen state

**Why.** The profile request fires on screen-1 submit and resolves while the user taps through
screens 2–4, so the reveal is already in memory on arrival. That is the entire latency strategy.
Per-screen state makes it impossible without a rewrite, so it is wired this way from the start
even though replay returns fast.

**Do not** move the `buildProfile()` call to screen 5.

---

### 2026-08-27 · Product name is "Find My Neo"

**Why.** "Akinator" is a trademark (Elokence SAS) — fine as internal shorthand and as the repo
name, never on screen or in the deck. Defined once as `PRODUCT_NAME` in `src/lib/brand.ts` so a
rename is one line rather than a find-and-replace under deadline.

---

### 2026-08-27 · Price is hidden while `plans.json` has `priceInr: null`

**Why.** I don't have verified current Neo pricing. Rendering a placeholder `₹` with no number
looked broken, and inventing a number in front of the Neo product team would be worse than
showing none. The plan name shows; the price appears automatically once a real number is filled in.

**Action:** fill `src/data/plans.json` from the real pricing page before the demo if you want the
price line visible.

---

### 2026-08-27 · Layout uses `align-content: safe center`

**Why.** Plain `center` clips the top of the reveal on a short viewport — centring pushes the
overflow above the scroll origin, so it can't be scrolled to. `safe center` centres while the
content fits and falls back to top-aligned when it doesn't. This was a real bug, caught on screen,
not a theoretical one.

---

### 2026-08-27 · Demo scope: screens 1 and 5 are real, the middles are cheap

**Why.** The 28 Aug demo is a viability check with the PM team, not a hackathon deliverable. The
generative reveal *is* the pitch; screens 3–4 narrate as "and then two more taps". They ended up
built anyway because they're twenty lines of option buttons each, but no time went into polishing
them.

---

### 2026-08-27 · Verified on screen, not just in the build

`npm run build` passing only means it compiles. These were checked in a real browser:

- **Paste + Enter**, using the actual system clipboard and a trusted `Ctrl+V` — not a synthetic
  event. Synthetic `ClipboardEvent`s don't trigger the browser's paste action at all, so an
  earlier "test" of this was silently meaningless. The demo script says to paste, so paste is
  the path that had to work.
- **1440×820** (a laptop with browser chrome): the reveal fits with no scrollbar.
- **390×844 mobile**: no horizontal overflow, mailboxes stack, buttons full-width.

---

### 2026-08-27 · `_comment` / `_TODO` keys in JSON data files

`demo.json` and `plans.json` carry underscore-prefixed keys documenting themselves in place —
worth it because those are the two files a non-frontend person will edit. `api.ts` casts through
`unknown`, so they're ignored at runtime.

**If anyone later adds zod validation or tightens these types, strip those keys first** or the
schema will reject them.

---

### 2026-08-27 · Vercel linked and deployed; git auto-deploy NOT connected

Project `hari-7720/neo-akinator`. Vite auto-detected (`vite build` → `dist`). Deployed and
verified serving.

**Auto-deploy on push failed** and needs a browser step only the account owner can do: the Vercel
account has no GitHub *login connection*, so it can't attach the repo. Fix at
vercel.com → Account Settings → Login Connections → add GitHub, then `npx vercel git connect`.
Until then, deploy manually with `npx vercel deploy` (preview) or `npx vercel --prod`.

**Deployment Protection is on by default**, so the URL is not publicly reachable — opening it
without a bypass token gets an auth wall. That is the right default for internal work, but it
means *you cannot just send the link to the PM*. Either disable protection for this project or
demo locally. The 28 Aug demo runs locally regardless, so this is a Sept 2 problem.

`.env.local` (Vercel OIDC token, and the LLM key in live mode) and `.vercel/` are gitignored.
`.gitignore` uses a broad `.env*` with `!.env.example` — the example is the only tracked env file.

---

### 2026-08-27 · "Not quite" now actually branches — reversing an earlier call

Originally both buttons on the guess screen advanced, on the reasoning that the reject branch
would be *narrated* rather than clicked. That was wrong: the guess screen is the screen doing the
persuading, and a PM poking at the demo would find two buttons with identical behaviour. That
reads as a mock, which undercuts the exact thing the screen is meant to prove.

"Not quite" now returns to the text box with the original answer preserved (edit, don't retype)
and clears the stale profile so the guess can't flash the old answer on the way back.

Verified in-browser: 139 characters preserved, Continue re-enabled.

---

### 2026-08-27 · Vercel git auto-deploy verified, not assumed

`vercel git connect` reported "already connected", which is not the same as working. Confirmed by
pushing a real commit and watching a new production deployment appear (7s build, Ready).

---

### 2026-08-27 · REPOSITIONED — we are a qualifier, not a site builder

Darrel pointed at `neo.space/ai-website-builder`. Walked it on production. Neo's live flow is
**category → free-text business description → generate site → domain → email**, on 130,000+
businesses. That is our flow, already shipped.

New position, and it is the honest one: **build a persona, land the user on the right domain
(with real pricing for alternates), the right mailbox plan and the right site plan — then hand
them into Neo's existing builder to pay and finish the site.** We do not build site generation.

**Correction, 27 Aug (later):** Neo's builder *is* the purchase flow — "Try it for free" lands in
`join.neo.space` with `source_hook=purchaseFlow`. Describe → generate → buy is already one
continuous flow Neo owns end to end. So we are **not** adding a purchase path. The accurate claim
is entering that same funnel **earlier and pre-qualified** — domain chosen, mailbox count known,
plan fitted, before the category picker. Overstating this loses credibility with the people who
built it. See `docs/neo-product-facts.md`.

Consequences already applied: CTA copy is now "Claim it and start building", the plan line says
"you finish the site in Neo's builder", and the reveal offers priced domain alternates.
Integration with the builder is NOT built — that is the next real piece of work.

---

### 2026-08-27 · The taxonomy finding — our strongest evidence

Neo's category step has a real taxonomy: "food" returns *Food & Beverages*, "retail" returns
seven options. But **"bakery" matches nothing**, and the raw string is silently accepted as a
custom entry.

That is the live, reproducible mechanism behind 5,318 distinct `business_industry` values
(including "Pizza" and "purchase"). Ten seconds to demonstrate on production. It argues directly
for free-text-plus-normalisation over a picker, which is exactly what we do.

Lead the pitch with it.

---

### 2026-08-27 · Adaptive question engine replaces the fixed screen order

The old flow ran the model once on screen 1 and everything after was fixed. That is precisely
why it felt like a form rather than something intelligent.

Now: `src/lib/questions.ts` is a bank where each question resolves a named signal, and
`src/lib/engine.ts` picks whichever unresolved question narrows the most. The model *suggests*
which to ask next (`nextQuestionId`); the engine overrules it if that signal is already resolved
or the id isn't real. **The model makes the flow feel intelligent; it cannot break it.**

Two people describing different businesses now get different question paths. That is the thing
Neo's picker structurally cannot do.

---

### 2026-08-27 · Gamification: the narrowing must be visible

Akinator works because you watch it close in on you. A form with nice transitions does not do
that. So: a confidence ring plus a count of remaining possible setups, docked top-centre so it
never scrolls away.

The count opens at **5,318** — the real number of distinct `business_industry` strings in Neo's
persona data. The data-quality finding is inside the experience rather than on a slide.

Decay is exponential against confidence (`^3.2`), not linear: early answers should feel dramatic
(thousands falling away), later ones precise (dozens to a handful). Linear reads as a progress
bar, which is the opposite of the feeling we want.

Verified live: 5,318 → 1,614 from the free text alone → 1,595 → 840 → 230 → 41.

All of it is computed deterministically in `engine.ts`. A confidence number the model invented
is a number that can embarrass us in front of the PM.

---

### 2026-08-27 · Bug: side effect inside a React state updater

`answer()` called `setStage()` inside `setEngine(prev => ...)`. React double-invokes updaters
under StrictMode, so the routing decision fired twice and the flow re-asked a question it had
already asked ("What needs standing up first?" appeared twice in a live walkthrough).

Fixed by computing the next state from `engine` directly and routing outside the updater.
State updaters must stay pure. Caught by walking the flow in a browser, not by the type checker.

---

### 2026-08-27 · Domain availability + pricing via DomScan; RDAP removed

Availability and indicative pricing now come from DomScan through our own `/api/domains`
endpoint. The key lives in `.env.local` (gitignored) and is read server-side only.

**RDAP was built first and then removed.** It was free, keyless and CORS-open, which was
genuinely attractive — but DomScan's `/v1/status` is RDAP-backed anyway (`source: "rdap"`),
costs 1 credit regardless of TLD count, and gives availability *and* pricing through one
integration. Two sources of truth for one fact wasn't worth the maintenance.

Runs on plain `npm run dev` via a Vite middleware in `vite.config.ts` that mounts the *same*
handler as the Vercel function, so there is no "works locally, breaks deployed". `vercel dev`
is not needed.

---

### 2026-08-27 · DomScan credits — the expensive mistake, and the fix

**`/v1/prices` bills per TLD × REGISTRAR PAIR, not per request.** An unfiltered
`?tlds=com,in,co` fans out across every registrar DomScan tracks. My first test call cost
**78 credits** (10,000 → 9,922) — about 25 registrars × 3 TLDs.

Costs from their OpenAPI spec (`x-domscan-credits`):

| Endpoint | Cost |
|---|---|
| `/v1/status?name=X&tlds=a,b,c` | 1 per request — TLD count is free, so always batch here |
| `/v1/prices` unfiltered | 1 per TLD × registrar — ~25× what you want |
| `/v1/prices?registrars=porkbun` | 1 per TLD |
| `/v1/rdap` | 2 — strictly worse than `/v1/status` for us |
| `/v1/suggest` | 5 (2 with `check=false`) — budget before using |
| `/v1/tlds`, `/v1/credits` | 0 |

Applied: a single-registrar filter, TLDs capped at 3, and two caches with deliberately
different TTLs — prices are per-TLD and identical for every user (6h, shared globally),
availability is per-user (10m, just long enough to survive a session's re-renders).

Measured after the fix: **cold 4 credits, new business 1, repeat 0.** That is ~9,900
new-business lookups on the free tier rather than ~125.

Three TLDs is also a product decision, not only thrift: more than three alternates turns a
confident recommendation into a shopping list.

---

### 2026-08-27 · The prices shown are NOT Neo's prices

DomScan returns third-party **registrar** list prices in **USD**. We take the cheapest
eligible registrar and convert at a hardcoded 95 INR/USD, rounded to ₹10.

So the figure is wrong in two ways at once: wrong currency origin, and wrong seller — the
user buys from **Neo**, not Porkbun. It is a placeholder that makes the reveal feel complete.

**→ Replace with Neo's own domain search API, which returns availability AND Neo's actual
price.** Needs function-head approval. Until then, do not present these numbers to anyone who
sells Neo domains without saying they're indicative.

The FX rate is hardcoded on purpose — a live FX feed would be false precision on top of the
wrong seller's price.

---

### 2026-08-27 · Reskinned to Neo's brand — and what we gave up

Applied Neo's live tokens: Poppins, `#0066FF`, white surfaces, `#333` text, 6px control radius,
and their blue→pink gradient (`#1078ff → #fe4ca2`) on the guessed business name and the wordmark.

**We gave up a better-looking thing.** The dark purple/orange treatment was more striking and
more distinctive. It also looked like someone else's product. For a "should we ship this"
conversation with Neo product, looking native to the pricing page is worth more than looking
impressive — the pitch is that this belongs there.

The wordmark is deliberately **not** a copy of Neo's logo. Faking someone's mark is worse than
not using it; it reads as a Neo sub-brand instead.

---

### 2026-08-27 · Stop when confident, not at a fixed count

`MAX_QUESTIONS` went 3 → 4, plus an early exit at `confidence >= 0.82` (never before the second
answer).

Three was picked arbitrarily when the engine was built, optimising for completion when the quiz
was just a plan router. Once the positioning became "build a persona", three was wrong: it left
half the six-question bank unresolved, so the plan, domain and feature picks rested on less than
they could — and the narrowing, which is the whole mechanic, was over in one jump.

Four is a **ceiling, not a target**. Every question on a pre-purchase page is a place to drop off,
so stopping early when the answer wouldn't change is both kinder and more faithful to the idea:
it stops when it's got you, not when it runs out of script.

Consequence: the hook copy says "a few questions" and the question header dropped its "of N".
Promising an exact number we might not ask is a small dishonesty people notice.

---

### 2026-08-27 · Tuning constants, and why they are what they are

Someone will change these. Here's what breaks.

- **`STARTING_SETUPS = 5318`** — the real count of distinct `business_industry` strings in the
  persona data (13,968 rows). Not decorative: it puts the data-quality finding *inside* the
  experience instead of on a slide. Change it and you lose the story.
- **Decay exponent `^3.2`** — makes early answers dramatic (thousands falling away) and later
  ones precise (dozens to a handful). Drop it toward 1 and it becomes a linear progress bar,
  which is exactly the feeling we're avoiding. Raise it much past 4 and everything collapses on
  the first answer, leaving nothing to watch.
- **Confidence base `0.22`** when industry is known — the ring must not open at empty after
  someone has just written a paragraph. That reads as "you weren't listening".
- **`USD_TO_INR = 95`**, hardcoded — a live FX feed would be false precision on top of the wrong
  seller's price.
- **Porkbun as the single pricing registrar** — publishes an official feed and prices near the
  floor, which suits an indicative "from" figure. Any single registrar would do; the point is
  that *one* keeps `/v1/prices` at 1 credit per TLD instead of ~25.

---

### 2026-08-27 · Feature highlights are a fixed bank, matched deterministically

The reveal names one or two real Neo features tied to what the user actually said — "contact
forms, so enquiries land in your inbox instead of your DMs" only appears because they told us
orders come through DMs.

**The model does not choose them and must never write them.** Inventing a Neo feature in front
of the Neo product team is the worst failure available here. `src/lib/features.ts` is a fixed
list; `pickFeatures()` matches on signals with a priority tie-break, and always-true fallbacks
mean the block is never empty.

The allow-list is `docs/neo-product-facts.md`, verified against Confluence `NP/698843154` — not
transcribed from marketing pages, which was the first (wrong) version.

Two claims that file corrected:
- Neo's builder generates a **one-page landing site**, not a website in general. Never imply multi-page.
- "Generate design" picks template/colour/font **randomly client-side**, not via AI. It is not
  listed as an AI feature.

---

### 2026-08-27 · All domain options stay visible

The alternates row used to hide whichever domain was selected, so it reshuffled on every switch
and you could never see the full set. Now all three render with the active one filled in Neo blue.

Caught from a screenshot where `.in` was selected and appeared to have vanished. It was working
as designed; the design was wrong.

---

### 2026-08-27 · Open, deliberately not decided

- **Sound.** Two or three cues (advance, reveal tick, CTA). Worth ~30 minutes *after* the reveal
  is right, and it must ship muted-by-default with a visible toggle so a quiet room can't
  embarrass the demo.
- **Default branch is `master`,** not `main`. Trivial to change while the repo is young.
- **Whether the Neo KR1 persona bullet is in design/PM phase.** This is the Ignite
  disqualification risk. The PM meeting is the place to ask.

---

### 2026-08-28 · Show Neo's real generated site instead of drafting our own

We no longer write site copy. `api/_lib/neoSite.ts` calls Neo's own generator and the reveal
renders what it returns — their headings, their product names, their Pexels images.

Pipeline (all confirmed working server-to-server, no auth, no CAPTCHA):
`t:"bi"` → `t:"sc"` → `files/images/search/bulk/unauth`.

**Live-first, with a real fallback.** The fixture at `src/data/replay/neo-site.json` is a
*recorded genuine response*, not hand-written, so a failure can never show the user copy Neo
wouldn't have produced. The footer says "offline — recorded earlier" when that path is taken —
quietly substituting stale output for live output is the kind of thing noticed at the worst
possible moment.

**Wording is deliberately narrow.** The card says *"Content generated by Neo · suggested X
template"*, not "your site". We show their content in our own card, not their template layout,
and template choice is not deterministic — see below. Overstating this to the people who built
it is the fastest way to lose credibility.

API gotchas paid for, all in `neoSite.ts`: `crid` is required on the *image* endpoint too
(not just generate); `gid` must be a UUIDv4; `sq` is capped at **10** per request — 20 returns
`400 parameter:"sq"`; and `p` is a JSON *string*, not a nested object.

---

### 2026-08-28 · Template selection is not deterministic — seven results, one business

The same Proof & Butter description has returned seven different templates:

`fashion_store` · `property` ("Real Estate") · `bio_site` · `offline_services` · `logistics` ·
`speciality_retail` · `creator`

Some of those pairs shared an `industryKey` and still differed. So this is not only "the
category is wrong" — selection is unstable in itself. A bakery has been an estate agent and a
logistics company.

This is evidence, not a caveat, and it is stronger than the 5,318-distinct-values point on its
own: the category step feeds a data-quality problem *and* steers a design choice that is not
stable anyway.

---

### 2026-08-28 · Neo's generator takes 22–38s, so we show their own loader

Measured repeatedly. The call fires on screen-1 submit and runs in parallel with the questions,
but the flow only occupies ~15–20s of user time, so a visible wait remains.

`NeoSiteGenerating.tsx` shows Neo's **own twelve-step loader copy**, verbatim from their spec
(`NP/698843154`), following their own rules: ~2s per step, no looping, hold on the last step.
Using their words is the honest choice — it genuinely is their generator running, and the wait
is theirs. Looping would make 38s look like a hang.

Client timeout is 45s before falling back. Deliberately generous: falling back early would show
the bakery fixture to someone who typed something else, which is worse than waiting.

---

### 2026-08-28 · Vercel functions must declare the Edge runtime

`/api/domains` returned `FUNCTION_INVOCATION_FAILED` in production while working perfectly
locally. Cause: the handlers are written against the Web API (`Request`/`Response`), but
Vercel's **default Node runtime** passes an `IncomingMessage` whose `req.url` is a bare path —
so `new URL(req.url)` throws `ERR_INVALID_URL`.

Fix: `export const config = { runtime: "edge" }` on both functions. Safe, because they only use
`fetch` and `process.env`.

**This class of bug cannot be caught locally** — the Vite dev middleware hands us a different
request object than Vercel does. Deploy and hit the real endpoint before believing an API works.

Also added `@types/node` — the build was surfacing `Cannot find name 'process'`.

---

### 2026-08-28 · The `neo-akinator.vercel.app` alias regenerates on every prod deploy

Removed twice now; Vercel recreates it from the original project name each time. It is behind
Deployment Protection so nobody can reach it, but the trademarked name should not sit on a URL.
The permanent fix is in the dashboard's Domains settings, not the CLI. Until then, remove it
after each production deploy: `npx vercel alias rm neo-akinator.vercel.app --yes`.

---

### 2026-08-31 · Questions are multi-select, with a free-text box on most

Two changes to the question screens, and they belong together.

**Multi-select where the world is multi-select.** `question.multi` decides per question. True
for "where do customers reach you" and "what do you use for mail" — people genuinely take
orders on Instagram *and* over the phone, and genuinely use Gmail *and* Outlook. False for
headcount and mail-vs-site, where the options really are exclusive. Forcing one answer
everywhere gives a tidier dataset and a worse profile.

**A free-text box under the options.** Neo's own persona survey has "Others (free text)" on its
multi-selects, and ~6.6% of their Q1 answers land there. It is also the only place after screen
one where someone can tell us something we didn't think to ask.

Free text alone is a valid answer: type without picking anything and the signal counts as
resolved, so the engine won't ask again. Someone who writes "we sell at weekend markets" has
told us more than any option would have.

**The trap this created, and the fix.** Multi-select means a profile value can now be an
ARRAY. Every `p.customerChannel === "social"` in `features.ts` and `rules.ts` would have
silently stopped matching, with nothing failing loudly to say so. All of them now go through
`has()` in `engine.ts`, which handles scalar and array. **Never compare a profile value with
`===` again** — use `has()`.

---

### 2026-08-31 · Client error and degradation reporting

The app is on a public link people open unattended, so a crash was previously a blank page
nobody heard about. Four layers now report to `/api/log`, which writes one greppable line into
Vercel's runtime logs (`npx vercel logs <url>`):

| Source | Catches |
|---|---|
| `window.onerror` | any uncaught JS error |
| `unhandledrejection` | failed promises / async errors |
| `ErrorBoundary` | React **render** crashes — the other two miss these entirely |
| **`reportDegraded`** | silent fallbacks |

**The last one matters most.** The app swallows failures on purpose — `domains.ts` returns `[]`,
`neoSite.ts` falls back to the recorded fixture. Without this, Neo's generator could be down for
every visitor and we would cheerfully serve the bakery fixture forever, looking perfectly fine.
Verified by simulating an outage; it logged `degraded: neo-site unreachable`.

Three guards so telemetry can never become the problem: deduped by message, capped at 8 per
session (a render loop must not flood the log), and `keepalive` so a report survives the page
dying. It never throws.

Bare `"Script error."` reports are dropped — that is cross-origin extension noise (Grammarly,
`chrome.runtime`), not us.

No Sentry, deliberately. If this ever needs to be more than "tell me it broke", use Sentry —
which is what Neo themselves run (`sentry.eks.ops.titan.email` appears throughout their HARs).

---

### 2026-08-31 · Demo bookmarklet, and the framing saga

`tools/bookmarklet/` injects our entry point onto Neo's **real** pricing page. That placement is
the deployment story, and showing it beats describing it.

**The overlay works only while Vercel Deployment Protection is OFF** (currently off). With it on,
the request is redirected to Vercel's login page, which sends `X-Frame-Options: DENY` and
`frame-ancestors 'none'`. `USE_OVERLAY` in `source.js` must be flipped back to `false` if
protection is ever re-enabled.

**Neo does not block this.** Their headers are `frame-ancestors 'self'` / `SAMEORIGIN`, which
stop others embedding *them*; they place no restriction on what their page may embed. Verified
by header trace, after wrongly assuming otherwise twice.

**A mistake worth recording.** An earlier version tried the iframe and "fell back" on failure,
using the frame's `load` event as the success signal. **A blocked frame still fires `load`** — so
the failure was never detected, the test falsely passed, and the user got a dead white overlay.
There is no reliable cross-origin way to distinguish "my app rendered" from "the error page
rendered". The honest fix was to stop guessing and gate on a flag.

Two demo-day notes: Neo's pricing page fires an **exit-intent modal** with a dark backdrop that
will cover the button — the bookmarklet sets `site_last_exit_intent_shown_at` to suppress it.
And injected JS does not survive a page reload.

---

### 2026-08-31 · CTA is a real handoff; timeouts raised for venue wifi

**The CTA now works.** It is an `<a>` to `join.neo.space/site/domain-selection` carrying `bn`,
`bd`, `industryKey`, `source_hook=purchaseFlow` and `utm_content=neotest` so Neo can filter our
traffic. Still an anchor a person clicks, never a scripted redirect (CLAUDE.md rule 5), and
`target="_blank"` so the demo doesn't navigate away from the reveal mid-pitch.

`bn` prefers **the business name Neo's own generator extracted** — the header block of the
generated site, e.g. "Proof & Butter Bakery" — over our domain slug. Their builder wants a
readable name, and handing back the one their model produced means the name they see next is
the name they just saw. Verified live.

**Timeouts raised: client 45s → 90s, server `sc` call 60s → 80s.** Generation measures 22–38s,
so 45s left almost no margin, and hackathon venue wifi eats margin. Falling back shows the
*recorded bakery* response to someone who typed a different business — the single most visible
way this can embarrass itself in front of judges. Waiting is strictly better than being wrong,
and Neo's own loader copy makes the wait read as intentional.

---

### 2026-08-31 · Repo renamed to `find-my-neo`

Was `neo-akinator`. The earlier reasoning — renaming a remote mid-project breaks clones for no
benefit — was outweighed once the deployment link went public: a trademarked name sitting in a
public repo URL is exactly the exposure `docs/naming.md` exists to prevent.

GitHub redirects the old URL, so existing clones keep working. Run
`git remote set-url origin https://github.com/THR1212/find-my-neo.git` to stop relying on it.
The local folder is still `Projects/neo-akinator` — harmless, nobody outside sees it.

The **Vercel alias** `neo-akinator.vercel.app` is a separate thing and still regenerates on
every production deploy; keep removing it.

---

### 2026-09-02 · A refresh no longer loses the run (`src/lib/persist.ts`)

The whole flow lived in React state, so a reload dropped the profile, every answer, and Neo's
generated site. That was survivable while questions came from a fixed local bank and the only
cost was retyping. It stops being survivable once questions are **generated per session**: a
refresh then means paying for every generation again *and* sitting through Neo's 22-38s
generator a second time. On venue wifi, in front of judges, that is the difference between a
recoverable fat-finger and a dead demo.

**sessionStorage, not localStorage.** This is "don't lose my place", not "remember me next
week". A new tab should start clean, and a profile silently restoring days later is worse than
no restore at all. Belt and braces on top: a `v` field (a shape change discards rather than
deserialising last week's fields into today's) and a 2h TTL.

Three things worth knowing before touching it:

- **`loading` and `error` are deliberately not persisted.** Restoring `loading: true` would
  paint a spinner with no request behind it, and it would never resolve. Instead a resume
  effect re-fires whichever half had not landed - profile if `reveal` is null, Neo's site if
  `neoSite` is null. Verified both ways: with both present, **zero** network calls on reload;
  with `neoSite` stripped, **exactly one** `/api/neo-site`.
- **The resume effect is ref-guarded, not dep-array-guarded.** StrictMode runs effects twice in
  development, and here that guard is the difference between one Neo generation and two.
- **`restart()` calls `clearSnapshot()` explicitly.** `saveSnapshot` skips the hook stage, so
  without the explicit clear the run the user just cleared would survive in storage and the
  next reload would resurrect it.

Snapshot measures ~9.5KB, nearly all of it Neo's 17-block site. sessionStorage caps around 5MB.

### 2026-09-02 · The narrowing meter was eating clicks on the first option

Found while testing the above, not by looking for it. `.meter-dock` is `position: fixed`,
`z-index: 4`, and was `pointer-events: auto`. On a short viewport (a laptop with devtools open,
a landscape phone) it lands on top of the **first option button** and swallows the click:
`elementFromPoint` at the button's centre returned `DIV.meter-dock`.

The failure is completely silent - the option just never selects, no error, nothing in the
console. It reads as "the app is broken" to anyone it happens to.

Fix is one line, `pointer-events: none` on `.meter-dock`. Nothing in the meter is interactive,
so it has no business intercepting pointer events at all.

**Worth generalising:** anything `position: fixed` floating over the flow needs
`pointer-events: none` unless it is genuinely clickable. Check this again after Moin's
animation pass - a new fixed overlay is the obvious way to reintroduce it.

### 2026-09-02 · Correction: the dock did not cause the double-advance

Earlier the same day I wrote that the meter-dock overlay "explains both oddities". It explains
one. The dock **swallowed** clicks; the other symptom was one click producing **two**
`applyAnswer` calls. Opposite failure modes - an overlay cannot manufacture a click.

Instrumented `applyAnswer` with question id + `performance.now()` and re-ran the flow. One
click produces exactly one call, four questions, four entries. **The double-advance was a
stale-uid artifact of the browser automation, not app behaviour.** Instrumentation removed.

While proving that, two things did turn up that are real:

- **The outgoing screen stays clickable for ~700ms+** after an answer. `AnimatePresence
  mode="wait"` keeps it mounted through the exit, and `elementFromPoint` at the option's centre
  still returns that option the whole time. Two clicks 150ms apart both fire - reproduced.
- **It happens to be harmless.** `answer()` computes `applyAnswer(engine, ...)` from the
  current `engine`, and both clicks run before React commits, so both derive the same result
  from the same base state. Idempotent, `asked` picks up no duplicate. Verified.

That second point is luck, not design, and it holds *only* while a repeat click hits the same
question. If the incoming screen ever becomes reachable at that coordinate mid-transition, the
second call would compute from the stale `engine` and **drop the first answer**. So Moin's
click-feedback task is not only polish - it removes the reason a person clicks twice at all.
Whoever adds a post-advance input lockout should not treat this as merely cosmetic.

### 2026-09-02 · Two follow-ups on the persistence work

- **`rejectGuess` now clears `neoSite`.** `restart()` always did; "Not quite" did not. Neo's
  site was generated from the description the user is about to rewrite, so keeping it lets the
  reveal show the *previous* business's site until the new generation lands - the same
  wrong-content failure the 90s timeout exists to prevent. Pre-existing, but persistence would
  have carried it across a reload too.
- **The resume effect only fires for `guess` / `question` / `reveal`.** Parked on Describe the
  user is about to retype, so re-firing a profile call and a Neo generation for the text being
  replaced is pure waste, and Neo's generator is the one call worth not wasting.

Version and TTL guards tested rather than assumed, each against a control: `v: 0` -> hook
screen; `savedAt` 3h old -> hook screen; a byte-identical snapshot with a fresh `savedAt` ->
restores to question 2. Without that last control, "did not restore" would prove nothing.

### 2026-09-02 · Questions reweighted; the import-first order is retired

The flow led with the import question because `docs/handoff.md` called import intent "the
strongest retention signal in the persona data", and `questions.ts` carried `weight: 0.3` on it
to make the engine ask it first. That claim has now been recomputed from source and it does not
mean what we thought.

It is true that "imported emails and contacts" retains at 82.4%. But **"No, don't want to
import" retains at 79.5%** — the entire spread between answers is 8.6 points. What actually
separates people is whether the field is filled at all: **79.3% answered vs 29.5% blank**, a
2.7x gap that survives holding login fixed and holding billing cycle fixed. And it is not
"answering anything is good" — the signup-time fields (`employee_count`, `role_in_business`,
`business_industry`) run the other way, 33.0% answered against 44.1% blank.

`import_emails_contacts` and `current_email_app` are filled on the same 2,484 of 18,399 orders,
far fewer than the signup-time fields, so they sit later in Neo's onboarding. Their retention
measures **how far someone got**, not what they wanted. Worse, for our purposes it is not
knowable at the moment we ask: we ask before purchase, of a cold visitor, and the 82% was
measured on people who answered after signing up. It is an outcome leak, not a predictor.

**New weights, by how much the answer moves the recommendation** rather than by how interesting
it is. Totals still sum to 1.25, so the narrowing meter's pacing is untouched — only the order
in which questions surface has moved.

| Question | Was | Now | Why |
|---|---|---|---|
| `team` → `mailboxCount` | 0.15 | **0.30** | straight multiplier on price, and gates Lite/Starter/Standard |
| `surface` | 0.25 | 0.25 | gates the site plan entirely, and the billing cycle |
| `sells` | 0.15 | 0.20 | picks the site tier, so it moves the price |
| `channel` | 0.20 | 0.20 | no plan effect, but six feature rules |
| `import` | **0.30** | 0.15 | still gates Lite vs Starter — just not the most |
| `client` | 0.20 | 0.15 | same selection effect as import, and feeds no plan decision |

### The team question now asks for addresses, not headcount

Related and more than cosmetic. `mbx_segment` in Neo's own data shows **39–64% of mailboxes per
domain are generic role addresses** — info@, sales@, support@ — so a one-person business
routinely wants three mailboxes. Asking "how many of you are there?" got us a headcount that
`rules.ts` then priced as a mailbox count. That is wrong in the common case and wrong in the
direction that annoys people: a solo operator wanting `info@` and `sales@` alongside their own
name was priced for **one** mailbox and pushed to **Lite**, which caps them.

So the question is now "How many email addresses do you need?" and resolves a new
`mailboxCount` signal. `teamSize` survives and still means headcount — the model infers it from
the free text and the guess screen reads it back ("A team of three") — but it only stands in for
pricing when the mailbox question never got asked. `rules.ts` prefers `mailboxCount`;
`Reveal.tsx`'s prop was renamed from `teamSize` to match, since it was only ever used to compute
a mailbox count.

### What did NOT change

The **yearly billing default in `rules.ts` stands**, and is now verified rather than inherited:
two-yearly 73.0% vs monthly 30.9% on 18,399 deduped orders, confirmed in the same direction on a
second and much larger dataset (22.0% vs 3.7% m12 across 153,673 accounts, a 5.9x gap that
survives holding mailbox count fixed). The caveat now sits next to the number in the code: this
is correlational, and a yearly default may sort customers rather than save them.

No fixed screen order was reintroduced — this is a reweighting, and the engine still asks
whichever unresolved signal narrows most (CLAUDE.md). Full workings in `docs/data-findings.md`.

---

### 2026-09-02 · The profile step goes live, on Titan's own taxonomy

`api/profile.ts` + `api/_lib/profileService.ts`. The logic sits in the service, not the route,
so `vite.config.ts` can mount the same function and `npm run dev` behaves like the deployed
build — the pattern `domainService.ts` already set.

**The model is constrained to Titan's analytics taxonomy** (16 industries) as a strict enum.
Neo's `business_industry` field is free text with 5,318 distinct values, 78% of them appearing
exactly once and 1,128 the same answer typed differently, so it routes nothing. "Bakery" now
resolves to Food & Beverage instead of matching nothing. Darrel's §6.

**Three taxonomies, and it matters which is which.** (1) Neo's free-text survey field, the
problem. (2) Titan's analytics taxonomy, what we normalise into. (3) Neo's site-builder
`industryKey` picker, what their generator consumes — we have observed only 7 of these.
We emit (2) and map to (3).

(2) is Titan's, not Neo's: the unfiltered dashboard pages cover 1.3M domains, all of Titan.
The same dashboard applies the taxonomy under a `Neo Business` filter at **29.9K domains**, so
it does classify Neo's customers — but **29.9K is the number to quote for Neo**, never 1.3M.
Conflating them is wrong by two orders of magnitude and is the exact error Darrel's caveats
warn about. Getting Neo's full `industryKey` list would let us emit (3) directly and drop the
mapping; worth asking Neo for.

That fixed a live bug on the way. `industryKeyFor()` only knew Neo's builder spellings, so it
returned null for everything and **the handoff URL never carried `industryKey` at all**. Verified
in production earlier that day. `TAXONOMY_TO_NEO` maps the six industries with a real
equivalent; the other ten stay unmapped deliberately — omitting the param lets Neo pick, whereas
guessing a near neighbour is how a painter gets a photography template.

**The model still decides nothing that costs money.** No price, no plan, no billing cycle, and
explicitly not the mailbox count — the prompt says so, because headcount and address count
diverge for most Neo customers (§7). Domain entries come back with `priceInr: null`; DomScan
fills them in.

**gpt-5.6-luna, not terra.** Same industry, headcount, stem and mailboxes on the same inputs,
at a tenth of the price — roughly $0.0005 a call, so ~30,000 calls inside a $15 budget against
~3,300 on terra. One prompt fix was needed: luna read "one lowercase noun phrase" literally and
flattened proper nouns to "a two-person bakery in bandra called proof & butter". The schema now
says to keep proper-noun capitalisation.

### 2026-09-02 · Two silent failures found while wiring it up

**`llm.ts` captured `LLM_MODE` into a module-level const.** `vite.config.ts` copies the LLM vars
into `process.env` from inside `configureServer`, which runs *after* the config module graph is
imported — so the const captured `undefined`, defaulted to `"replay"`, and the dev server served
fixtures while `.env.local` plainly said `LLM_MODE=live`. There was no symptom: replay threw "no
fixture for profile", the route caught it and degraded, and the response was an ordinary HTTP
200. You would iterate prompts against an LLM that was switched off. `mode()`, `model()` and the
client are now read at call time. On Vercel the env exists before any import, so this only ever
bit in dev — which is exactly where prompts get written.

**`Guess.tsx` treated an empty summary as "still loading".** The condition was
`if (loading || !summary)`. A degraded profile has an empty summary, so the screen that exists to
keep the flow alive when the model fails instead hung on "Working it out…" forever. Degradation
now has its own state — "We didn't catch enough to guess", with *Keep going* and *Rewrite it*.
The questions work fine without a summary; the engine simply asks more of them, which is correct
when we know less.

Both were invisible in normal use and only surfaced because the degraded path was deliberately
exercised. Worth remembering that a fallback nobody tests is a fallback that does not work.

---

### 2026-09-02 · Every production deploy was failing, and neither build caught it

Since `api/profile.ts` landed, every push to master produced `● Error` in production while
previews stayed `● Ready`. The message:

    The Edge Function "api/domains" is referencing unsupported modules:
      - api/_lib/replay.js: node:fs/promises, node:path
      - openai: #x509-transport-state

Adding the profile route pulled `llm.ts` -> `replay.ts` (node:fs) and the OpenAI SDK into the
Edge bundle, where neither exists.

**Three things worth keeping from this.**

It blames `api/domains`, which imports neither module. Vercel bundles Edge functions into one
shared namespace, so the function named in the error is not the function at fault. Chasing
`api/domains` would have wasted the afternoon.

It fires at "Deploying outputs" — after the build. `npm run build` passed, and so did a local
`vercel build` (`"status": "ok"`). **Only `npx vercel deploy` reproduces it.** Add that to the
verification loop alongside "test on the deployed URL".

And `api/` was never typechecked at all. `tsconfig.app` covers `src/`, `tsconfig.node` covers
`vite.config.ts`, and nothing covered `api/` — so eleven pre-existing "Cannot find name
'process'" errors in `domainService`, `llm` and `replay` had been reaching Vercel unseen for
days. `api/tsconfig.json` now covers it, referenced from the root so `tsc -b` builds it.

**Fixed by moving the route to the Node runtime**, which is where it belonged: no Edge CPU
ceiling on a multi-second model call, and the OpenAI SDK is supported rather than tolerated.
The other three routes stay on Edge — they are plain fetch-and-shape handlers. The value must
be `"nodejs"`; `"nodejs20.x"` is rejected at deploy time.

### 2026-09-02 · The reveal claimed a taken domain was available

Found by running the flow, not by reading it. A florist was shown
**"thistletwine.com — Available"**. DomScan says it is taken.

Three things lined up. `api/profile.ts` emitted `available: true` "optimistically for the
first paint". The client lookup then aborted at its 6s timeout — a cold lookup spends 4
credits across several upstream calls and measured past that. And `Reveal.tsx` renders the
green badge on `(live ?? fallback) === true`, so the optimism became the answer.

`available` is now `boolean | null`, and **null is load-bearing: it means we do not know.** A
badge prints only for an explicit true or false. Timeout raised to 12s, which costs nothing —
the reveal is already waiting on Neo's 22-38s generator.

The generalisable bit: an optimistic default is a lie with a delay on it. For anything a
person can check in one keystroke, silence beats a guess.

Separately, `chosenDomain` was pinned to 0, so a taken `.com` stayed on the hero and drove
the mailbox addresses, the plan line and the handoff URL — while the alternates that exist for
exactly that case sat below it. The selection now moves to the first domain DomScan explicitly
says is free, but only if the person has not chosen one themselves. `available === true`,
never `!== false`.

### 2026-09-02 · A domain of your own, and the TLD cap was set on a guess

Our three suggestions all come from one stem the model guessed, so when that guess is wrong —
or when everything is taken — the flow had no answer but "start over". The reveal now takes a
typed domain, checks it through the same live lookup, and appends it as a fourth option,
selected only if DomScan says it is free.

`MAX_TLDS` 3 -> 6. The cap predated understanding the credit model: `/v1/status` costs 1
credit **per request** regardless of how many TLDs are batched, so availability for six costs
exactly what three cost. Only `/v1/prices` bills per TLD, so a cold lookup goes ~4 -> ~7
against a balance of ~9,900 free credits a month (~1,400 cold sessions).

That exposed a sanitiser bug: the TLD filter stripped dots, turning `co.uk` into `couk` and
asking DomScan about a TLD that does not exist. Multi-label TLDs are real and anyone typing
their own domain will use one.

**Still crooked, and not fixed:** the suggested TLDs are `com/in/co`. An Edinburgh florist is
offered `.in` with a model-written note about serving customers in India. It is the honest
consequence of an India-first default and the custom input only mitigates it; locale-aware
suggestions are the real fix.

---

### 2026-09-02 · Production served the recorded bakery to everyone, and every test passed

After adding the three server env vars to Vercel and redeploying, `/api/profile` answered
correctly to curl in production: `degraded: false`, real industry, six questions surfaced.
The site itself still showed "a two-person bakery in Bandra" to every visitor.

**`VITE_LLM_MODE` was never set.** It is a separate, CLIENT-side, BUILD-TIME variable:

    src/lib/api.ts   const MODE = import.meta.env.VITE_LLM_MODE ?? "replay"

Absent, it defaults to `replay`, so the browser served the bundled fixture and **never called
`/api/profile` at all**. The route was healthy; nothing was reaching it.

The lesson is about the test, not the variable. Curl hit the route directly and so exercised
everything except the one layer that was broken — a green result from below the fault. The same
shape as two earlier misses this week: the iframe `load` event firing on a blocked frame, and
`vercel build` succeeding while the deploy failed. **Test at the layer the user is on.** The
browser check that would have caught this takes the same thirty seconds as the curl.

Two guards added rather than just the fix:

- `warnIfReplayInProduction()` reports a degradation when a build is in replay mode on any
  host that is not localhost. On localhost replay is legitimate — it is how you rehearse for
  free. Anywhere else it means a missing build variable, and nothing else would ever say so.
- `.env.example` now states that there are TWO mode switches, that one is build-time, and
  lists all five vars Vercel needs. Half of them being right is the failure mode.

Also confirmed in the same run, and it retroactively justifies preferring Neo's own key: Neo's
classifier returned `industryKey=ecommerce_retail`, while our hand-built map holds
`ecommerce_and_retail` for the same meaning. **Different format.** Which of the two the builder
accepts is now moot — we send back the key Neo itself produced.

---

## 03 Sep 2026 — the flow only looked adaptive

Three complaints from a walkthrough ("questions are repeated", "we're not getting more
information", "the reveal has stuff fixed"). Each turned out to have a separate, provable
cause, and the first one is the embarrassing one.

### Every business got the same four questions

`nextQuestion`'s fallback is `unresolved.reduce((best, q) => q.weight > best.weight ? q : best)`
over a static array with static weights. That is a pure function of which signals are resolved,
so with an empty profile it returns the same answer every time. Simulated:

```
MAX=4  ->  asked 4: team, surface, channel, sells   never asked: [import, client]
```

`import` and `client` were **unreachable at MAX_QUESTIONS = 4**, for everyone, always.
The model's `nextQuestionId` did not save it: App consumed it once and then called
`setPreferredQuestionId(null)`, so it only ever moved question 1.

CLAUDE.md's "different businesses get different paths" was, until today, false.

**Fixed** by replacing the single pick with `questionPriority` — all six ids ranked — held in
`engine.priority` and consumed head-first for the whole flow. Every id is still re-checked
against what is actually unresolved, so the model orders and the engine decides.

### The description was read and then thrown away

`kickOff` seeded `industry`, `brandName` and `teamSize`. None of those is a question signal, so
all six questions stayed unresolved no matter what someone wrote. Type "orders come through
Instagram DMs and we need a website" and you were still asked where customers reach you and what
needs standing up first — the two things you had just said.

**Fixed** with `prefill`: an enum-constrained object using the same value vocabulary as the
`resolves` payloads, so a prefilled signal is indistinguishable from a tapped one and
`isResolved` skips its question for free. Capped at `MAX_PREFILL = 2` — pacing, not safety;
without a cap a chatty description leaves a two-question flow, which reads as giving up.
**`mailboxCount` is never prefillable**: free text offers headcount, and pricing headcount as
addresses is the exact bug the `teamSize -> mailboxCount` rename fixed.

Verified live, two businesses, same build:

```
florist, Instagram, sells online, wants a site
  prefill  surface=both, customerChannel=[social]   ->  asked team, import, client
bike shop, phone and walk-ins, no online sales
  prefill  customerChannel=[offline], sellsOnline=false  ->  asked surface, team, client
```

### A prefill must be visible or it is not correctable

Skipping a question means an answer nobody gave now sets their plan and their price. The guess
screen lists what was taken from the text (`describePrefill`), rendered through the same option
table the question would have used — and through the generated wording when it has landed, so
the words match what they would have seen. "Not quite" stays a real escape.

### The narrowing counter is no longer a design input

Decision from the walkthrough: the "possible setups" number comes off screen (Moin is replacing
it with screen-relevant words). `confidence()` stays — it drives the early stop, which is flow
logic. `remainingSetups()` stays computed, for our own reference only.

This retired a mechanism that had been argued for twice: discounting prefilled signals at half
weight in `resolvedWeight`, to stop the meter collapsing from 2,401 to 576 before question one.
That was a cosmetic fix for a cosmetic problem. Checked whether it still mattered for flow — at
`MAX_PREFILL = 2` the discounted and undiscounted paths produce the same 3-question flow,
because confidence never reaches the 0.82 early stop before question 3 either way. Dropped.

**MAX_QUESTIONS stays 4.** Raising it to 6 was considered and rejected on measurement: 5 and 6
are the *same flow*, because the confidence early stop fires after the 5th, and the bank only
holds six — a cap of 6 means "ask everything", which deletes selection adaptivity entirely.
4 also keeps Mailchimp (4) and Rinda (3) precedent from `docs/competitor-qualification.md`, sits
well inside Darrel's 40-65% quiz-completion risk, and preserves the pitch line that four
questions at the moment of purchase is a different artefact from Microsoft's seven on a
marketing microsite.

### Neo Lite is not a plan Neo sells

`chooseMailPlan` routed solo, non-importing, mail-only people to **Neo Lite** at ₹59 — a real
price for a plan no checkout can fulfil. It is in the pricing sheet; it is not in the offering.
Removed from `plans.json` and `rules.ts`. **The pricing sheet is not the offering** — do not
re-derive a recommendable plan from `plans.json` without checking it is purchasable.

Consequence to watch: `importIntent` no longer gates any plan, so it now only colours a feature
bullet. Its 0.15 weight is the least justified in the bank. Flagged, not silently re-tuned,
because weights are data-derived.

### Site features were three entries, two of which matched everyone

`neo_domain` and `custom_domain` are `matches: () => true`, so every site recommendation showed
the same bullets. Personalised copy on a feature set that never varied.

The mail half of `features.ts` draws on Neo's JSON config
(`static.flock.co/meta/plan/feature/config/en-US.json`) — re-verified today: **12 of our 13
names are byte-identical to its `heading` field**, the exception being `neo_domain`, whose
heading is templated with a sample domain. **There is no equivalent config for site features.**
Three plausible paths were probed and all 403'd, and the pricing page fetches no second config;
the site half of that page is static markup. Captured from their live DOM into
`src/data/site-features.json` with its read date, and the site bank rebuilt from it.

That capture found a worse bug than the templating:

**Basic has no Contact Forms.** (Plus 1,000, Growth unlimited. Basic carries only "Business
contact info" — a phone number printed on the page.) `chooseSitePlan` sent every business that
was *not* selling online to Basic, which is precisely the enquiry-led business whose site exists
to collect an enquiry. We recommended the one tier that cannot do the job, next to a real price.

Rewritten to gate on how someone is reached rather than whether money moves: offline-and-not-
selling gets Basic (contact info genuinely is the whole job); anyone needing a form, testimonials
or their own branding gets Plus; a real catalogue on a multi-person operation gets **Growth**,
which `plans.json` listed and this function could previously never return (caught by
`docs/data-findings.md` §9).

This also resolves a tension with our own data. §9 warns that routing every "I take payments"
answer to Plus over-serves ~two thirds of them, since only 3.5% of orders ever build an order
form. Both hold. What changed is the *reason* for Plus — **contact** forms, which an enquiry
business demonstrably needs, rather than **order** forms, which most never touch.

### Still templated on the reveal, and known

`buildRationale()` (4 templates), the plan note about connecting a domain you own, the
`cancel anytime · you finish the site in Neo's builder` tail, and every section label. The
`because` strings in `features.ts` are fixed too — generating those, degrading to the fixed
string, is the obvious next pass and follows the pattern `questionService` already proves.

### Later the same day — Pandora entitlements, and the same bug on the mail side

Darrel supplied per-plan feature entitlements verified from the **Pandora backend**. Saved as
`src/data/plan-features.json`, and it now outranks both other sources: the flock.co config gives
Neo's verbatim *names* but says nothing about who gets what, and `site-features.json` was read
off a marketing table.

**It confirms the site finding independently.** Contact form absent on Basic, 1,000/month on
Plus, unlimited on Growth — same for testimonials, remove-branding, WhatsApp and subscriptions.
The `chooseSitePlan` rewrite stands on backend data, not on a pricing page.

**And it found the same fault on the mail side, worse.** Four features we carry are **Max-only**,
and `chooseMailPlan` can only return Starter or Standard:

| feature | Pandora says | we were showing it to |
|---|---|---|
| Invoice Builder | **disabled** on Starter and Standard | anyone selling online |
| AI Email Writer (`Titan AI`) | Max only | social / personal-email users |
| Campaign Mode (`Email marketing`) | Max only | anyone selling online |
| Appointment Booking | Max only — **and it is a MAIL entitlement, not a site one** | offline / non-selling users |
| Signature Designer | Standard and Max, not Starter | personal-email users on Starter |

So a florist who sells online was being offered **Invoice Builder** as a reason to buy **Neo
Starter**, which explicitly does not have it. `minMailPlan` now gates these the same way
`minSitePlan` gates the site half, and `appointment_booking` has been moved to `surface: "mail"`
where it belongs.

**Open, and deliberately not guessed:** Max is now unreachable in `rules.ts` — the same shape as
`growth` was this morning — so those four features can never legitimately surface. Either Max
becomes reachable for a defensible case or they are dead weight. Max is roughly 5x Starter per
mailbox, so that needs an argument, not a feature match.

**Naming:** Pandora's `Titan MCP` is **Neo MCP** for our purposes. It is disabled on every plan,
so it can never be a reason to buy and must never be rendered.

### The `because` strings are generated now (03 Sep, later)

The last large piece of the reveal that was templated. Feature *names* were Neo's own and the
*matching* was deterministic, but the clause after the em dash — the only part that is actually
personalisation — was hand-written and identical for everyone who matched.

`/api/reasons` (`api/_lib/reasonService.ts`), its own route for the same reason
questionService is one: **latency placement, not tidiness.** `/api/questions` gates the first
question screen; reasons are not needed until the reveal, 30s+ away and already waiting behind
Neo's generator. Adding them to the questions call would have delayed a screen someone is
looking at, to save a round trip nobody is waiting on.

Third instance of the same three-layer pattern, and it is now the house style:

```
which feature is shown   FIXED       pickFeatures — profile match AND plan entitlement
the feature NAME         FIXED       Neo's own verbatim heading
the `because` clause     GENERATED   withReason, applied AFTER both filters
```

Applying the overlay after entitlement filtering is the part that matters: a generation can
change why we say a feature matters, but it cannot introduce a feature, rename one, or slip a
Max-only feature next to a Starter price.

Measured on the florist: 20 of 20 written, none dropped, and specific —
`site_contact_forms` came back as *"bouquet enquiries stop getting buried in your Instagram
DMs"* against the fixed meaning *"enquiries arrive in their inbox instead of getting lost in a
chat thread"*. Same claim, their words.

One prompt fix on the first run: the model prefixed every clause with `"so that"`, which the
hand-written strings do not carry — so a run where some lines generated and some fell back
would have read inconsistently. Fixed in the prompt AND stripped in validation. Worth being
precise that this is **normalisation, not repair**: it fixes the shape of a string whose meaning
is unchanged, unlike an unknown option id, where guessing intent is exactly what the drop rule
forbids.

Snapshot version 4. Four features (invoice builder, AI email writer, campaign mode, appointment
booking) still get reasons written for them and can never be shown while Max is unreachable —
a few wasted output tokens, kept so the shape stays stable if Max ever becomes reachable.

### Mailbox count was selecting the plan tier, and it should never have been

Hari, reading the reveal: *"the way we are suggesting plan based on number of mailboxes seem
wrong."* It was, and the arithmetic is stark.

`chooseMailPlan` read `if (mailboxes >= 5) return standard`. Neo prices mail **per mailbox**, so
a five-person business was quoted **5 × ₹299 = ₹1,495/mo** where **5 × ₹149 = ₹745/mo** would
have done. Double, for having five people. At eight mailboxes it was ₹2,392 against ₹1,192.

The only available defence was storage, and Neo's own catalogue kills it. `storage` reads:
*"Storage space allotted for **each mailbox** that is created."* Per mailbox. Adding mailboxes
adds storage and can never exhaust a tier. **Count multiplies the bill; letting it also select
the tier charges for it twice.** Checked before deleting, precisely because "bigger team needs
the bigger plan" is plausible enough to survive on vibes.

Tier now gates on capability, like `chooseSitePlan` — but deliberately narrower, because the
two are not symmetric. Basic genuinely *cannot* capture a lead, so Plus was a capability floor.
Nothing on Starter is broken; Standard is polish, and a weaker reason to upgrade deserves a
stricter rule. **Standard on exactly one signal:** `customerChannel: personal_email`, because
Signature Designer is Standard-and-above and "every mail looks like it came from a real
business" is exactly that person's move off a personal Gmail.

**Growth is now unreachable too, and that is the consistent answer rather than a regression.**
It was gated this morning on `sellsOnline && mailboxes >= 5` — the identical fault in a hat.
What separates Growth from Plus is catalogue size (unlimited vs 500 products); a 1-3 person
business does not have 500 products, and CLAUDE.md scopes this product at 1-3 person businesses
with no 50-200 branch. Growth and Max are both out of scope **by design**, not oversight. If a
catalogue-size signal ever exists, that is what should gate Growth — not headcount, not
mailboxes.

Accepted trade-off, recorded in the code: a capability bump multiplies across mailboxes. In the
1-3 person range that is ₹150/mo, which is the range we are built for.

Also removed: the dead `lite` branch in `buildRationale`, and `blurb` from the mail plan type.
`blurb` was typed and rendered nowhere — three hand-written strings in exactly the register
this project spent the day removing ("Everything, for teams that live in their inbox"). What a
"why not the cheaper one" line actually needs is the **delta between adjacent tiers**, and
`plan-features.json` already holds it exactly: Starter→Standard is signature, branding,
templates, 50 GB; Standard→Max is Invoice Builder, AI Email Writer, Campaign Mode, 100 GB.
Derive it there rather than hand-writing a second string.

### One call that sees the whole run

Hari: *"we need to make the ai calls better to involve full context throughout the run until
reveal screen."* Agreed, with one shape rather than the obvious one.

**Not** a model call per question. Question 4's wording reflecting answers 1-3 would cost ~10s
on the critical path per question, for wording nobody re-reads, and it would put a model
between someone and the next tap four more times.

**Instead:** one call at the moment the last question is answered, fed the description, every
answer as displayed, and the plan `rules.ts` has already chosen. It gets ~20s of free cover
behind Neo's generator and it is the only place full context changes something a person sees.

It **explains** the plan and never selects one. The plan, mailbox count and cheaper-tier delta
go in as given facts, never as a question — rule 2 held at the exact point it is most tempting
to break, since this is the model call closest to the money.

Two guards worth naming:

- **No prices, enforced by regex.** The real price is printed directly above the sentence, so a
  generated figure that disagrees with it is the worst available failure. Any price- or
  limit-shaped string is refused outright rather than trimmed. Seven cases tested.
- **`buildRationale` stays.** This is the only model call in the flow with no recorded fallback
  of its own — the other three degrade to fixed wording, fixed `because` strings and a recorded
  site. Deleting those four templates would turn a failed generation into a blank line on the
  one screen CLAUDE.md says must be perfect. The reveal shows the fixed line until this lands.

`whyNotCheaper` is built only from `CHEAPER_TIER`, which is Pandora's entitlements — "what does
the cheaper plan lack" is precisely the question a model answers plausibly and wrongly. It has
no fallback and simply does not render if it fails: saying nothing beats hand-waving.

Snapshot version 5.

### The narrowing is real now — candidates, needs and discrimination

Hari: *"i dont think hard rules which dont justify the plans make sense."* Correct, and it
applied to my own fix from earlier the same day: I deleted `mailboxes >= 5 -> Standard` and
replaced it with `personal_email -> Standard`, which is better sourced and structurally
identical — one boolean, a 2x price change, no accumulated evidence.

**`src/lib/candidates.ts` is constraint satisfaction, not scoring.** That is deliberate:
CLAUDE.md is right that an unauditable score is worse than a short if-chain, and a weighted
model would have been exactly that. Instead an answer establishes a **need**, a need sets a
**floor** on a tier which traces to a Pandora entitlement, and we recommend the **cheapest**
setup meeting every floor. Cheapest-satisfying is the anti-over-serving rule from §9, enforced
rather than intended.

The reveal now prints the needs that bound. "Why this plan" is derived from what actually
forced the shape — not a template, not a model's opinion.

**Question choice is expected reduction in surviving candidates**, uniform prior over answers.
That is the Akinator mechanic and it is arithmetic, which matters: the literature is clear that
LLMs are inconsistent probabilistic reasoners (arxiv 2605.06915), so belief updates stay in
code and the model is left to read prose. Weight breaks ties, so the data-derived ordering
still decides between questions that narrow equally.

**Three bugs the probe caught that reading would not have.**

1. *The first scoring formula was backwards.* It measured Gini impurity of the partition — how
   EVENLY a question splits the field, not how much it shrinks it. A question that discriminates
   not at all leaves every option holding the full set, which is perfectly even and scored
   highest: `import` and `client` outranked `surface`. Balance was being read as information.
2. *Survivors could hit zero.* "Just email" plus "I sell online" made the needs unsatisfiable,
   because the site floors were not guarded on mail-only. A contradiction, not a customer.
3. *`capture_enquiries` fired on an unknown channel.* Inherited from the if-chain, where "the
   failure is asymmetric" was right because nothing would ever ask. Now something does, and
   firing on ignorance forced the site floor to Plus before question one — so no later answer
   could change the outcome and **every question scored zero narrowing**. A need that fires on
   ignorance makes the whole flow pointless.

Worth recording: **the count can go up.** Learning someone is reached by phone alone removes
the contact-form floor, so more setups reopen and the price falls (₹508 to ₹418 on a real run).
Narrowing is the usual direction, not a guarantee — one more reason the on-screen counter was
the wrong thing to show.

Not done yet: `max` and `growth` are in the candidate set but no need reaches them. That is
what the six new questions are for, and they are next.

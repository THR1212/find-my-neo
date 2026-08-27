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
eligible registrar and convert at a hardcoded 88 INR/USD, rounded to ₹10.

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
- **`USD_TO_INR = 88`**, hardcoded — a live FX feed would be false precision on top of the wrong
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

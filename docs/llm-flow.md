# How the LLM actually works in this project

Written 03 Sep 2026, for anyone who needs to reason about the flow without reading five files.
If this disagrees with the code, the code is right and this is stale — every claim below is
checkable, and where it matters the file and function are named.

---

## The one-paragraph version

**Three model calls fire at screen-1 submit**, all given only the free text, and **one more
fires when the last question is answered** — that one sees the whole run: the description,
every answer, and the plan already chosen. No model ever picks a plan, a price, a billing cycle
or a mailbox count. They produce structured objects; deterministic TypeScript does the rest.

---

## What fires, and when

Everything starts at `submitDescription` in `src/App.tsx`. It fires four requests **in
parallel** and advances the screen immediately without awaiting any of them. A fifth
(`/api/rationale`) fires later, from `answer()`, when `shouldReveal` first returns true.

| # | Call | Runtime | Fed | Needed by | Measured |
|---|---|---|---|---|---|
| 1 | `POST /api/profile` | **Node** | free text | the guess screen, immediately | ~5s |
| 2 | `POST /api/questions` | **Node** | free text | the first question screen | ~14s |
| 2b | `POST /api/reasons` | **Node** | free text | the reveal | ~15s |
| 4 | `POST /api/plan` | **Node** | description + **every answer** + the chosen plan | the reveal | ~6s |
| 5 | `POST /api/rationale` | **Node** | as above, plus the **verified** plan | the reveal | ~8s |
| 3 | `GET /api/neo-site` | Edge | free text | the reveal | 19–38s |
| — | `GET /api/domains` | Edge | domain stem | the reveal | ~2s, no model |

1, 2 and 2b are model calls. 3 is **Neo's** generator, not ours; the domains row is DomScan.

**Why 1 and 2 are separate calls.** They used to be one, and it measured **37 seconds in
production** — slower than Neo's own generator, so the guess screen sat on "Working it out…"
for half a minute. The guess needs only the profile; question wording is not needed until
someone taps "That's us". Questions are roughly 5× the output tokens, so bundling made the fast
half wait on the slow half for nothing.

---

## Call 1 — `/api/profile` (`api/_lib/profileService.ts`)

Free text in, a structured profile out. This is the only call on the critical path.

**What it returns**

- `summary` — the "You're a two-person bakery in Bandra…" line on the guess screen
- `industry` — constrained to a **strict enum** of Titan's 16 industries, so "bakery" resolves
  to Food & Beverage instead of becoming a 5,319th distinct free-text value
- `teamSize` — headcount, and *only* headcount
- `domainStem`, `suggestedMailboxes`, `mailboxLabels`, `domainNotes`
- `questionPriority` — all six question ids, ranked for this business
- `prefill` — signals the description already answered

**What it must never return:** a plan, a price, a cycle, or a mailbox count. Not "does not
currently" — the schema has no field for them. See CLAUDE.md rule 2.

### `questionPriority` — why the flow is adaptive at all

Until 03 Sep this was a single `nextQuestionId`, and `App.tsx` discarded it after one use. So
questions 2–4 fell to `nextQuestion`'s fallback in `src/lib/engine.ts`, which is a `reduce` over
a static array with static weights — a pure function that returns the same thing every time:

```
every business, always:  team → surface → channel → sells
never asked at MAX_QUESTIONS=4:  import, client
```

The model now ranks all **nine** questions, and `engine.ts` **re-checks every id** against what
is genuinely unresolved — a hallucinated id, a duplicate, or an already-answered one is skipped
rather than trusted.

But the ranking is only a tie-break now. `nextQuestion` selects on **what the answer would
change**, lexicographically: the price first, then the rest of the reveal, then the
data-derived weight. See `discrimination` in `src/lib/candidates.ts`. The model orders where
the arithmetic is indifferent; the engine decides.

### `prefill` — why we stop asking what you just told us

The model may report signals the description already answered, using **the exact value
vocabulary the tap-able options use** (`PREFILL_VALUES` in `profileService.ts` mirrors the
`resolves` payloads in `src/lib/questions.ts`). So a prefilled signal is indistinguishable from
a tapped one, and `isResolved` skips its question for free.

Three guardrails, each for a reason that has already bitten:

1. **`mailboxCount` is never prefillable.** Free text offers headcount ("there are three of
   us"), and 39–64% of mailboxes on a Neo domain are role addresses, so headcount under-counts.
   Pricing a headcount as an address count is the exact bug the `teamSize → mailboxCount`
   rename fixed. It is always asked.
2. **`MAX_PREFILL = 3`.** Six signals, four questions: prefilling three still leaves three to
   ask. Anything the cap drops is **recorded** in the `[profile-adapt]` log — dropped-by-cap and
   never-mentioned are otherwise the same silence, and only one of them is a design choice.
3. **Prefilled signals count at HALF weight** in `resolvedWeight` (`engine.ts`). Not cosmetic:
   at full weight, confidence clears the 0.82 early-stop after two questions, so a *richer*
   description made us collect *less* from the person. Backwards.

Anything prefilled is shown on the guess screen ("You already told us, so we won't ask: …") via
`describePrefill`. A prefill puts an answer nobody tapped into the profile that sets their
price, so it has to be visible, or "Not quite" is decorative.

---

## Call 2 — `/api/questions` (`api/_lib/questionService.ts`)

Rewrites the nine questions for this specific business. **Three layers, and only the middle one
is generated:**

```
signals + weights        FIXED      (data-derived — docs/data-findings.md)
surface text             GENERATED  (prompt, sub-line, placeholder, labels, hints)
option ids + `resolves`  FIXED
```

So no generation can change what an answer *means*, only how it *reads*. The model never sees a
`resolves` value, a weight, or a signal.

**The rule that matters most:** an option describes the **customer's own situation**, never what
Neo does.

- GOOD `"Instagram, WhatsApp and Twitter"` — a fact about them
- BAD `"Sell tickets on your site"` — a promise about us
- BAD `"Sync your booking system"` — invents an integration

**Validation drops, never repairs** (`validateQuestions`). An unknown option id means the model
misunderstood the structure, and guessing which option it meant would reintroduce the exact risk
fixed ids exist to remove. A question left with fewer than 2 usable options is dropped whole and
renders from the fixed bank verbatim. **That floor is the safety story:** a bad generation
degrades to what shipped before the feature existed.

**Timing subtlety:** wording lands ~14s in. If someone taps "That's us" faster than that,
`App.tsx` deliberately *discards* it (`stageRef` guard) rather than rewriting a question under
someone mid-read.

---

## Call 3 — `/api/reasons` (`api/_lib/reasonService.ts`)

Writes the `because` half of each feature line — the clause after the em dash — for this
business. Same three-layer split:

```
which feature is shown   FIXED      (pickFeatures: profile match + plan entitlement)
the feature NAME         FIXED      (Neo's own verbatim heading)
the `because` clause     GENERATED
```

Its own route purely for latency placement: `/api/questions` gates the first question screen,
whereas reasons are not needed until the reveal, 30s+ away and already waiting on Neo's
generator. Free real estate.

`withReason` overlays it **after** selection and entitlement filtering, so a generation can
change why we say a feature matters but never which feature appears, and never next to a plan
that lacks it. An empty map renders the hand-written strings.

For a florist who mentioned Instagram DMs, the model returned e.g.
`site_contact_forms` → *"bouquet enquiries stop getting buried in your Instagram DMs"* against
the fixed meaning *"enquiries arrive in their inbox instead of getting lost in a chat thread"* —
same claim, their words.

Validation drops unknown ids, duplicates, and anything under 8 or over 90 characters. It does
**normalise** a leading `"so that"` or stray dash, which is a shape fix on an unchanged meaning,
not a guess at intent — the reveal renders `Name — {because}` and the fixed strings carry no
`"so that"`, so a partly-fallen-back run would otherwise read inconsistently.

---

## Call 4 — `/api/plan` (`api/_lib/planService.ts`)

**The only place a model can change what somebody pays**, and its power is deliberately narrow.

`rules.ts` has already computed the cheapest setup satisfying every need, each need a Pandora
entitlement. The model is handed that plan and asked one question: does anything they said in
their own words reveal a requirement the fixed questions did not capture? Almost always no —
and no raise is the correct, common outcome.

Three rules, all enforced server-side:

- **It may raise a tier, never lower one.** Below the solver would mean recommending a plan
  that provably cannot do something they said they do.
- **A raise needs a cited entitlement and a quote.** The entitlement is an enum, so it cannot
  be invented; the floor it implies is looked up in OUR table, never taken from the model; and
  the quoted evidence must actually appear in what the person wrote.
- **A tap beats an inference.** If the question owning that entitlement was answered by tapping
  an option, the citation is rejected outright. The first live test forced this: a video studio
  whose description mentioned enormous 4K video files had also tapped "Mostly just messages",
  and the model overrode their explicit answer. Filling gaps is the job; correcting someone
  about their own business is not.

Fail any check and the deterministic plan stands. Measured live:

```
tapped "mostly just messages"     -> rejected: they answered "volume" themselves
volume never asked                -> raised to Max, cites storage
answered in PROSE, nothing tapped -> raised to Max, cites invoice_builder
ordinary florist                  -> no raise
```

That third line is why this exists. A free-text answer used to reach only the rationale, which
explains rather than decides.

## Call 5 — `/api/rationale` (`api/_lib/rationaleService.ts`)

The only call that sees the whole run, and the only one fired after screen 1 — because it is
the only one that needs the answers. It writes the two sentences under the price.

**It explains the plan; it never selects one.** `rules.ts` has already decided before this is
called, and the plan, mailbox count and cheaper-tier delta arrive as **given facts in the
payload**, never as a question. That is rule 2 held at the exact point it would be most
tempting to break — the model is closest to the money here and furthest from being able to
touch it.

Two outputs:

- `rationale` — replaces `buildRationale`'s template. *"Two addresses keep florist enquiries
  separate, while a website gives Instagram customers somewhere to find you."*
- `whyNotCheaper` — *"The cheaper site option lacks a contact form and testimonials, and keeps
  Neo's branding."* Built only from `CHEAPER_TIER`, which is Pandora's entitlements, because
  "what does the cheap plan lack" is exactly what a model answers plausibly and wrongly.
  Darrel found Cynet, Mailchimp and Rinda all justifying the recommendation rather than just
  naming it.

**It may never write a price.** A regex refuses any price- or limit-shaped string outright,
because the real price is printed directly above and a number that disagrees with it is the
worst thing this screen can do.

**It is the one model call with no recorded fallback of its own**, which is why
`buildRationale`'s four templates were kept rather than deleted. The reveal renders the fixed
line until this lands and forever if it fails — never a spinner and never a gap, since an empty
slot under a real price reads as a broken page. `whyNotCheaper` has no fallback and simply does
not render; saying nothing beats hand-waving about a cheaper plan.

---

## What is NOT a model call

Everything that decides money.

| Decision | Where | Source of truth |
|---|---|---|
| mail plan | `chooseMailPlan`, `src/lib/rules.ts` | `src/data/plans.json` |
| site plan | `chooseSitePlan`, `src/lib/rules.ts` | `src/data/plan-features.json` |
| billing cycle | `chooseCycle` | retention data, `docs/data-findings.md` §1b |
| which features to show | `pickFeatures`, `src/lib/features.ts` | Neo's own catalogue |
| feature entitlement | `minMailPlan` / `minSitePlan` | `src/data/plan-features.json` (Pandora) |
| confidence, when to stop | `engine.ts` | arithmetic |
| domain availability, price | `api/_lib/domainService.ts` | DomScan |
| site copy and images | `api/_lib/neoSite.ts` | **Neo's own generator** |

Feature *names* are Neo's own, and which features appear is deterministic. Of the 13 features whose ids exist in Neo's config, **12 are
byte-identical** to its `heading` field (the exception is `neo_domain`, whose heading is
templated with a sample customer's domain). The other 7 come from Neo's site pricing table and
are recorded in `src/data/site-features.json`. Only the `because` half of each line is ours, and
it is generated per business — see Call 3.

---

## The model, cost, and failure

- **Provider is not Anthropic.** It is GPT-5.6 via `LLM_MODEL`; `gpt-5.6-luna` is the default
  we run ($0.2/$1.2 per 1M in/out), `gpt-5.6-terra` is the pricier fallback ($2/$12).
  **Do not invoke the `claude-api` skill on this repo** — it refuses non-Anthropic work.
- **Budget is $15 total.** Spend to date is a few cents. Rehearse in replay mode; it is free.
- Three gotchas, already paid for: no `temperature` at any value, `max_completion_tokens` not
  `max_tokens`, and check `finish_reason === "length"` before parsing.
- 20s timeout, one retry (`api/_lib/llm.ts`). Caps: profile 3000 output tokens, questions 2600.

**Everything degrades, nothing blocks** (CLAUDE.md rule 4):

| Call fails | You get |
|---|---|
| profile | a derived profile — a one-sentence guess from **their own words**, no industry. Guess still says "Here's what we think". **Never the replay fixture** — showing a Bandra bakery to someone who typed a cinema in Texas is the most visible way this can embarrass itself. The empty-guess screen is only if they typed nothing usable. |
| questions | an empty surface — all six render from the fixed bank. Exactly what shipped before the feature existed. |
| Neo's site | a *recorded real* response, and the card says "offline — recorded earlier". |
| DomScan | no badge and no price, rather than a wrong one. |

---

## Two mode switches, and they are not the same one

This cost a production outage that looked like a success.

| Variable | Side | Read | Controls |
|---|---|---|---|
| `LLM_MODE` | **server** | at request time | whether `api/*` calls the real provider |
| `VITE_LLM_MODE` | **client, BUILD-TIME** | baked into the bundle | whether the browser calls `/api/*` **at all** |

`VITE_LLM_MODE` was unset on Vercel, so it defaulted to `replay`, and every visitor got the
bundled bakery fixture — the browser never called the route. `curl` against `/api/profile`
passed the whole time, because it hit the route directly and so tested everything *except* the
broken layer. **Test at the layer the user is on.** `warnIfReplayInProduction()` in
`src/lib/api.ts` now reports a degradation if a non-localhost build is in replay mode.

---

## Where to look when it misbehaves

One line per request in Vercel runtime logs (`npx vercel logs <url>`), correlated by `sid`,
which also tags the client-side error lines from the same session:

- `[profile]` — `ms`, `model`, `mode`, `degraded`, and a `reason` when it failed. Logged on
  **every** path, not just failures: without a success line there is no denominator, so "are we
  degrading?" is unanswerable.
- `[profile-adapt]` — `priority`, `skip`, and anything `dropped`. **This is the one that tells
  you whether the flow is adapting.** Both fields empty on every request means we have quietly
  gone back to asking everyone the same four questions.
- `[questions]` — `surfaced`, `dropped`, `droppedDetail`.
- `[client-error]` — degradations reported from the browser.

**One record per completed run** is posted at the reveal (`src/lib/runLog.ts` → `/api/run`).
In dev it is appended to a gitignored **`runs.jsonl`** — one JSON object per line, which is the
artefact to refine against: `analysis/` can read it with the same Python Darrel already uses.
In production `api/run.ts` writes a compact `[run]` summary plus a clipped `[run-full]`, because
Vercel truncates long lines and the summary must always survive.

It carries the description, `prefilled`, `priority`, every question **as displayed** with what
was picked, the plan, all 20 generated reasons, the rationale, and every degradation. That is
what makes per-question drop-off measurable — the number Darrel's 40-65% completion benchmark
says matters most, and the one we would otherwise be guessing at if MAX_QUESTIONS rises.

`?debug=1` adds a **Download this run** button on the reveal, which hands the same record over
as a file. It is the best bug report anyone can give us.

In-session, `engine.trail` (`QuestionTrace`) records every question **as displayed**, with
`origin: fixed | generated`. Generated wording makes every run different, so without it a bug
report is unreproducible. It already caught one false alarm: a plan showing 8 mailboxes looked
like a bug until the trail showed the click had genuinely landed on "More than five".
**Since 03 Sep the run record reads it** — before that it died with the tab.

---

## The question bank

**Nine questions**, ceiling of 12, and the ceiling almost never binds. `shouldReveal` stops as
soon as nothing left could change the price, plus at most two more that can still change which
feature bullets appear (`pickFeatures` renders exactly two, so a third could change nothing
anyone reads).

Measured flow lengths: heavily prefilled 5, plain mail-only 6, phone-and-walk-in with a site 8.

Three of the nine — `volume`, `extras`, `catalogue` — reach Max and Growth, which no code path
could return before 03 Sep. They are **never prefillable**: each raises a floor to the most
expensive tier, and inferring a 4x price rise from a sentence somebody wrote about themselves
is the wrong kind of guess. Same reasoning as `mailboxCount`.

## What is still fixed, and known

Being honest about the remaining templating, since "it's generative" is easy to overclaim.
The `because` strings were on this list until 03 Sep and are now generated by `/api/reasons`;
the 20 hand-written ones in `features.ts` remain as the fallback every failure degrades to.

- `buildRationale()` in `rules.ts` — four templates, now the **fallback** behind `/api/rationale` rather than the only thing shown. Deliberately kept.
- The plan note ("Neo's domain purchase is coming…"), the `cancel anytime · you finish the site
  in Neo's builder` tail, and every reveal section label.
- `domainNotes` **are** generated, but only for `.com`/`.in`/`.co`. A domain someone checks
  themselves gets the fixed note "Your own idea".

## What the model is deliberately not doing

Worth stating, because it is a design choice rather than an omission:

- **No per-question call.** Question 4's wording cannot reflect answers 1–3. That would cost 4×
  the latency and tokens on the critical path for wording nobody re-reads.
- **No conversation state.** Nothing is carried between the two calls; both independently read
  the same free text.
- **No model involvement after screen 1.** Once the two calls land, the rest of the flow is
  arithmetic and lookup tables. If the reveal is wrong, a model did not do it — `rules.ts`,
  `features.ts` or `plans.json` did, and all three are readable in a sitting.

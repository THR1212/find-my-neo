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

### 2026-08-27 · Open, deliberately not decided

- **Sound.** Two or three cues (advance, reveal tick, CTA). Worth ~30 minutes *after* the reveal
  is right, and it must ship muted-by-default with a visible toggle so a quiet room can't
  embarrass the demo.
- **Default branch is `master`,** not `main`. Trivial to change while the repo is young.
- **Whether the Neo KR1 persona bullet is in design/PM phase.** This is the Ignite
  disqualification risk. The PM meeting is the place to ask.

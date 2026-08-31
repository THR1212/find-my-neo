# Your notes — how this thing actually works

Written for you, not for a PM or the team. My honest read.

---

## The flow in one paragraph

Someone lands on Neo's pricing page and doesn't know what to buy. They open our overlay, type
what their business is in one box, and we work out who they are. We ask up to four questions —
choosing each one based on what we still don't know — while a counter visibly narrows from 5,318
possible setups down to a handful. Then we show them: an available domain with priced
alternatives, their mailboxes, a site **that Neo's own AI generated**, a plan with a real price,
and one or two features that matter for *them* specifically. One button hands them into Neo's
existing purchase flow, further along than they'd otherwise enter it.

**We are a qualifier. Neo is the builder and the checkout.** That distinction is the whole
project — lose it and we're rebuilding something they already have.

---

## Part by part

### 1. Hook
A line on the pricing page opening a full-screen overlay. Deliberately doesn't replace the
pricing page — people who already know what they want are never blocked.

**Remember:** it degrades to nothing if our script fails. That's a feature, and it's the answer
to "what if it breaks on the pricing page".

### 2. Free text — "What's your business?"
The only real input, and the only reason an LLM is justified at all.

**Remember:** this is the entire differentiator versus Neo's category picker. Type "bakery" into
their picker and *nothing matches* — it silently stores the raw string. That's the 5,318-distinct-
values problem, live and reproducible in ten seconds.

### 3. The guess
We reflect the business back: *"You're a two-person bakery in Bandra taking custom cake orders
over Instagram."*

**Remember:** this is one of the two moments that sell the thing. It's also the only screen
allowed to make people wait — waiting to *read* something is different from waiting to be shown
something. Currently runs off a saved answer, not a live model call.

### 4. Adaptive questions (up to 4)
`engine.ts` picks whichever unresolved question narrows the most. The model *suggests* what to
ask next; the engine overrules it if that's already answered or the id is fake.

**Remember:**
- The model makes it feel intelligent. It cannot break it. That separation is deliberate.
- Two different businesses get two different question paths — Neo's picker structurally can't.
- It stops when confident, not at a fixed count. Hence "a few questions", never a number.
- The counter starting at **5,318** isn't decoration — it's the real count of distinct industry
  values in Neo's persona data. The data problem is *inside* the experience.

### 5. The reveal
Domain (live availability, priced alternatives) → mailboxes → **Neo's generated site** → why-this-
plan features → plan and real price → CTA.

**Remember:**
- **The site is Neo's content, not ours.** We call their generator server-to-server and render
  what comes back. We do not write site copy any more.
- It takes **22–38 seconds**, which is why there's a loader using Neo's own step wording. Fires
  on screen-1 submit, in parallel. Don't ever move that call later.
- **The model never picks a plan, a price, or a feature.** Rules table, pricing sheet, fixed
  feature bank. That's the answer to "what if it hallucinates".
- Feature names are Neo's own words, verbatim from their catalogue. Never paraphrase them.

---

## Things I'd want you to remember above all

**The strongest evidence isn't the messy data — it's the instability.** The same bakery
description has produced seven different templates: fashion_store, property ("Real Estate"),
bio_site, offline_services, logistics, speciality_retail, creator. Two of those pairs had the
*same* industry key and still differed. Their category step feeds a data-quality problem *and*
steers a design choice that isn't stable anyway.

**Don't overclaim the site.** It's their real content, rendered in our card. Not their template
layout, and not necessarily what that user would get on a second run.

**Neo's builder is already the purchase flow.** We are not adding a funnel. We enter theirs
earlier and pre-qualified. Saying otherwise to the people who built it loses the room.

**Everything degrades, nothing blocks.** Every external call has a defined failure path, and
where a fallback could mislead, the screen says so.

---

## What this currently is

A working, deployed prototype that does one thing genuinely well: it takes a sentence and returns
a personalised, mostly-real setup. Live domain availability, live site generation from Neo's own
API, real Neo pricing, deterministic plan and feature logic.

**Honest gaps:**
- The profile/guess step is still a saved answer. Everything else is live.
- The CTA is inert. The handoff URL is built but not wired to the button.
- We show one design; Neo offers three.
- No analysis folder — the retention numbers are quoted from the spreadsheet, not computed.

It is genuinely more than a mock, and less than a product. That's the right place to be for a
viability conversation.

---

## What it could be

**The narrow version, and the one I'd argue for:** a pre-purchase qualifier that ships on the
pricing page. It doesn't need to own anything — it profiles, recommends, and hands off. Its
whole value is that Neo currently asks a category question that actively misfires, and asks
nothing at all about mail before selling you a mail plan.

**The version that makes it strategic:** the qualifier becomes the *front door* for both halves.
Today mail and site are separate paths that upsell each other after the fact — domain right after
design, mail inside the editor. A profile taken once up front could route to the right shape of
purchase instead of selling one thing and cross-selling the rest later.

**The version that would actually be hard:** replacing the category step entirely. Free text in,
normalised industry out, feeding their existing generator with something better than a taxonomy
that has no "bakery". That's a small change to their funnel and it fixes a live bug.

**What I'd be wary of:** letting it grow into a site builder, a chatbot, or an onboarding flow.
All three already exist at Neo, and each would put us in a fight we'd lose. The reason this is
interesting is that it sits in the gap *before* their funnel starts.

---

## The one question that decides everything

Whether the KR1 persona bullet (`NP/1697185794`) has entered design or PM phase. If it has,
this is disqualified from Ignite regardless of how good it is. Ask on Monday, first.

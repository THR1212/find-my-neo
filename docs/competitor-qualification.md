# Do competitors qualify before selling?

Desk research, 2026-09-02. Task 4 in `analysis/README.md`, reframed: the brief asked for a
*dataset* comparing Neo against competitors, and no such dataset exists in anything we have.
The answerable version is the pitch question — **does anyone ask the user about their business
before selling them a plan, and does the answer change the plan?**

**Method and its limits.** Documentation, help-centre articles, official pricing pages, and
2025–26 walkthrough/review articles. No accounts were created, so no flow here was walked
first-hand. GoDaddy and IONOS product pages returned 403 to automated fetches, so those two are
reconstructed from reviewer descriptions — treat their question wording as paraphrase, not
verbatim. Onboarding flows change often; every finding is dated. Confidence is stated per
product and is not uniform.

---

## The headline: our claim is wrong in two directions, and the true version is better

**"Neo doesn't ask anything before selling" is false.** From our own HAR captures
(`docs/neo-product-facts.md`), Neo asks two things before any money changes hands:

1. **Category picker** (`/site/industry`) — "Tell us what your site is about". Searchable
   taxonomy plus six popular industries, and it **silently accepts any raw string** as a custom
   entry when nothing matches (`bakery` matches nothing). This is the live mechanism behind the
   5,318 distinct `business_industry` values.
2. **Free text** (`/site/your-idea`) — "Describe your business idea", behind a Turnstile CAPTCHA.

**"Competitors don't ask either" is also false.** All five site builders/hosts checked ask
business-context questions before checkout.

**"Nobody does question-then-recommend-a-plan" is false too** — there is one clean
counterexample, and the pitch must name it rather than hope nobody does (see below).

**What survives is narrower and much stronger:** everyone asks, and — with a single exception
outside our category — **nobody lets the answers touch the plan or the price.**

---

## Site builders and hosts: they all ask, none of it reaches the plan

| Product | Asks about the business pre-purchase? | Answers drive plan/price? | Confidence |
|---|---|---|---|
| **Squarespace** | Yes — "What's your site about?" (searchable list + free-text fallback), goals checklist, then Blueprint AI's 5 steps | **No — verified decoupled** | High |
| **Wix** | Yes — AI conversational onboarding (what the site is about, name, audience, tone) + goals checklist | No evidence of a recommendation; only a later **feature gate** | Medium |
| **GoDaddy (Airo)** | Yes — features needed, "what kind of business do you have?" (searchable free text), style, name, target customer, goals | No evidence found | Medium |
| **Hostinger** | Yes — free-text description (≤700 chars) or preset prompt chips | Not directly verified; fixed tier feature-gating only | Medium |
| **IONOS** | Yes — name, business category/sector, description, site goal, tone, palette | **No** — fixed tiers shown regardless | Medium-high |

**Squarespace is the cleanest evidence**, because it is explicit rather than inferred: Blueprint
AI is free on any plan, its answers shape templates/sections/copy/colours only, and
`squarespace.com/pricing` is a plain comparison table with no "recommended for you" logic.

**Wix's only link to plan is a gate, not a recommendation:** answering "sell products" will
eventually force an upgrade, because ecommerce is unavailable below Core. That is a wall you hit
later, not advice you are given up front. Whether Wix computes a recommended plan **could not be
verified either way** — do not assert it does.

Two useful details:

- **GoDaddy's own help article is titled "How many user email accounts do I need to buy?"** and
  the answer is: pick a quantity manually, in packs of 3 or 5. The company resells Microsoft 365
  email and still makes mailbox count a self-service quantity field with no question behind it.
- **Hostinger generates the site before payment** — a plan is only required to publish. Worth
  knowing, since it is the same "value before the wall" instinct our reveal relies on. One
  reviewer describes a different entry path where plan choice precedes the questionnaire;
  unresolved, flagged rather than guessed.

## Email providers: nobody asks industry, and nobody recommends — except Microsoft

| Provider | Pre-purchase questions | Recommends a plan? |
|---|---|---|
| **Microsoft 365 Business** | **7 questions incl. headcount and "What area do you work in?"** | **Yes — specific plan + price** |
| Google Workspace | Headcount, but at signup *after* a tier is chosen; feeds a seat/price calculator | No |
| Zoho Mail / One | None. "Not sure which one to pick?" routes to **a human** | No |
| Proton, Fastmail, Rackspace | None — per-user/per-mailbox static tiers | No |
| Namecheap, Bluehost | Mailbox **quantity** self-selected at checkout | No |
| **Titan** (Neo's own parent) | None found | No |

### The counterexample: Microsoft 365 Business Plan Chooser

Live and verified at
`microsoft.com/en-us/microsoft-365/business/microsoft-365-plan-chooser`. Seven pre-purchase
questions on the marketing site: employees (1 / 2–9 / 10–49 / 50–299), **"What area do you work
in?"** (Sales / Research / Finance / Law / Accounting / other), PC vs Mac, feature needs,
offline document use, IT support, security concerns. Output is an explicit plan recommendation
with a price, not a comparison table.

**This is genuinely the thing we are claiming to invent, shipping today.** The pitch has to name
it. Pretending otherwise is the single most likely way to lose credibility in the room, and the
honest differentiation is available:

- It is a **bundled-suite** wizard (Office apps, Copilot, security), not an email-first flow.
- It asks **headcount**, never addresses — see below.
- It recommends a plan but does not pick a **domain**, and does not generate anything.
- Seven questions on a marketing microsite is a different artefact from four questions on the
  pricing page at the moment of purchase.

Note the Titan row is a **weak negative**: no recommendation tool was found on `titan.email`,
but partner-embedded checkouts (inside Namecheap, GoDaddy, Hostinger) were not exhaustively
audited.

---

## The gap that is actually ours

Two claims survive the research, and both are defensible with named evidence.

**1. Nothing anyone asks before purchase reaches the plan.** Five site builders ask about the
business; all five spend the answer on templates and copy. Neo does exactly the same — its
category answer picks a *design*, and `docs/neo-product-facts.md` records it producing the wrong
design when the category is wrong. Only Microsoft, in a different category, converts answers
into a plan.

**2. Nobody asks for addresses. Not one product, including Microsoft.** Every provider that
prices per mailbox makes the count a manual quantity field (GoDaddy packs of 3/5; Namecheap,
Bluehost, Rackspace, Fastmail per-user tiers), and every product that asks about people asks
**headcount**. Bluehost's role-address nudge (`help@`, `admin@`, `sales@`) is the only hint
anyone has noticed the difference, and it is weakly sourced.

That matters because of our own §7 finding: **39–64% of mailboxes per Neo domain are generic
role addresses**. Headcount systematically under-counts what a small business needs, so
everyone in the market is asking the question that mis-prices the customer. "How many email
addresses do you need — info@, sales@, bookings@?" is unoccupied ground, and as of
DECISIONS 2026-09-02 it is the heaviest question in our bank.

---

## Correction, 2026-09-03: five more recommenders, found by hand

Darrel's own walk of the market (`Research Plan Recommendation.pdf`) turned up five products
running this pattern, and **one of them contradicts what the desk research above reported**.

| Product | What it asks | What it outputs |
|---|---|---|
| **Mailchimp** ([compare-plans](https://mailchimp.com/pricing/marketing/compare-plans/)) | 4 — team size, marketing goals, most-important features, number of contacts | Recommended plan, **why that plan**, and what is in it |
| **Rinda** ([pricing](https://www.rinda.ai/en/pricing)) | 3 — business type (3 options), number of people, how they manage buyer communication | Recommended plan, **why it's a fit**, features, "try again" |
| **Cynet** ([hosting recommender](https://www.cynet.com.my/hosting-recommender?#recommender)) | A question sequence | Recommended plan **plus alternatives**, and a start-over |
| **Capterra** ([get-software-recommendations](https://insights.capterra.com/get-software-recommendations)) | Industry, client size | Hands off to a human expert |
| **Mailpro** ([pricing](https://www.mailpro.com/pricing)) | One-page form | Cost updates dynamically |

**The correction:** the desk research above reported no native question-then-recommend flow
verified on Mailchimp. That was wrong — Mailchimp ships one, and it is the closest analogue to
ours of anything found. Automated search missed it because the flow sits behind an interaction
on the compare-plans page rather than on a documented URL. Worth remembering as a limit of desk
research generally: **absence of evidence here was mostly absence of looking properly.** The
"rare in B2B SaaS" claim below should be read with that in mind — it is weaker than it looked.

**Four design patterns worth stealing, all of them ours to lose:**

1. **"Why this plan"** — Mailchimp and Rinda both justify the recommendation rather than just
   naming it. We already have the machinery: `rationale` in `rules.ts` and the `because` strings
   in `features.ts`. This validates showing them prominently on the reveal, not as small print.
2. **Show alternatives** — Cynet recommends one plan *and* lists the others. We do this for
   domains (priced alternates) but show exactly one plan. A "why not the cheaper one" line
   would pre-empt the most obvious objection.
3. **Start over / try again** — Cynet and Rinda both offer it. We have `onRestart`; this says
   keep it visible rather than tucked away.
4. **Three to four questions** — Mailchimp asks 4, Rinda 3. Our `MAX_QUESTIONS = 4` now has
   *(number superseded — see the correction at the foot of this file)*
   direct precedent from the two closest analogues, not just the telecom/insurance range.

**And the addresses gap holds even here.** Rinda asks "number of people". Mailchimp asks team
size *and* number of contacts — a quantity that drives price, which is structurally what
`mailboxCount` is for us. Neither asks how many *addresses* the business needs. Five more
products, and still nobody occupies that ground.

## Three risks this research turns up

**1. Every conversion number available is vendor marketing.** Octane AI, Zoovu, RevenueHunt and
Interact all publish glowing case studies — and all four sell quiz software. No independent or
academic study was found isolating a pricing-recommendation quiz's effect on conversion, ARPU,
churn, or quality of customers acquired. **Do not put any of those numbers on the measurement
slide.** Our own retention data is stronger ground precisely because we computed it.

**2. Quiz funnels lose a lot of people.** Even flows marketed as high-converting report
**40–65% completion**, so a third or more abandon before seeing any recommendation. On a pricing
page that is drop-off we caused. This is the strongest argument for the confidence-based early
stop in `engine.ts` and for keeping `MAX_QUESTIONS` low.

**3. The pattern is rare in B2B SaaS, which cuts both ways.** No native "few questions → your
plan and price" flow could be verified on Shopify, HubSpot, Mailchimp, Webflow, Stripe, Notion
or Slack. It is common in insurance and telecom plan finders (4–8 questions) and in ecommerce
product quizzes. Read generously: the ground is open. Read sceptically: many well-resourced
companies have not done this, and "nobody does it" is not the same as "nobody tried". We cannot
tell which from desk research, and should not pretend to.

On question count, the cap was four when this was written — the **short end** of the observed
4–8 range, consistent with high-intent transactional plan-finders rather than engagement
quizzes. The cap is now 12, which sits **above** everything found in this research. The early
stop means the cap is not the number a person actually answers, so this is not a like-for-like
comparison; but if a run ever does ask ten questions on a pricing page, nothing in the observed
market supports it, and risk 2 above is the reason to care.

---

## What would strengthen this

- Walking the Microsoft chooser end to end and capturing exactly how the recommendation changes
  with answers. It is the only real prior art and we are guessing at its logic.
- Checking whether **Titan's partner-embedded checkouts** (Namecheap, GoDaddy, Hostinger) do any
  qualification — the one place a counterexample would be most embarrassing, and the one place
  we did not look properly.
- Confirming whether Wix computes a recommended plan. Currently unverified either way, and it is
  the largest hole in the site-builder table.

---

## Correction, 04 Sep 2026

`MAX_QUESTIONS` is **12**, not 4, and the bank is **seven** questions. The number above was
right when it was written and the *finding* still holds — the comparison set asks three to four
— but the ceiling is no longer what stops our run. `shouldReveal` does, when nothing left to ask
could change the recommendation, which in practice lands most runs at four to six questions.
The ceiling is now a guard rail rather than the design.

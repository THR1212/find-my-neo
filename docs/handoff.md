# Neo Akinator - Handoff Brief

Context carry-over for continuing this project in Claude Code.
Compiled 26 Aug 2026. Facts sourced from Titan Confluence and a persona/retention dataset unless marked otherwise.

---

## 1. The idea

A short adaptive quiz on Neo's pricing page. User describes their business in free text, the tool profiles them across ~5 questions, then reveals a personalised setup (available domain, mailbox names, draft site copy) and hands them into Neo's existing purchase flow pre-filled.

Differentiator vs existing Neo work: it is **generative and pre-purchase**, not a navigational decision tree and not post-purchase analytics.

---

## 2. Ignite 2026 - event facts

Source: Confluence space `INV`.

- Dates: 02-04 Sep 2026. 48 hours.
- Theme: "anything that helps small businesses succeed leveraging AI"
- Squad registration deadline was **21 Aug 2026, 12 noon** (already passed)
- Locations: Mumbai, Bangalore, Dubai. Cross-location squads encouraged to travel to Bangalore.
- Idea bank: released 48h before event. Problem statements: last week of August.

### Categories

| | Deep Craft | Open Field |
|---|---|---|
| Eligibility | All teams | GTM, Design, Data Science, CS, HR, Finance, Business Ops |
| Squad size | Up to 4 | Up to 3 |
| Focus | Full-stack build: backend, integration, deployment | Conceptual thinking, creative prototyping, UX. Less technical depth. |
| Prize | Rs 4L winner / Rs 2.5L runner-up | Rs 1L |
| LLM plan | Own existing plan | One provided per squad |

**We are entering Open Field.**

### What Ignite provides
- LLM plans (as above)
- Backup LLM account if credits exhausted, shared across two squads
- $15 API credit per squad, top-ups on request
- "Additional tools or access requests reviewed based on project requirement and existing access" - requires function head approval

### What Ignite does NOT provide
- No deployment environment or hosting. Not mentioned anywhere in the guidelines.
- Lovable is **not named** in any Ignite doc. It was raised in conversation as an example only.

### Constraints and thresholds
- Figma designs not accepted as the final Open Field prototype
- Projects must be competitor-research phase only, and **not already in design/PM phase at Titan** (disqualification clause)
- Prize thresholds: Open Field needs 5 registered squads for a winner award to exist. Deep Craft needs 5 for winner, 10 for runner-up.

---

## 3. Roadmap collision risk

Three existing Neo initiatives overlap. This is the main pitch vulnerability.

1. **Neo Product 2026 strategy, G1/KR1** (Confluence `NP/1697185794`) contains the verbatim bullet: *"Start persona with 'What are you setting this up for?', and personalise onboarding based on that."*
   - No linked spec or Figma found against it
   - Q2 note states they are only picking quick, low-investment experiments
   - Reads as an unstarted backlog bullet, but it is owned by Neo Product

2. **Neo Chat Bot V2** (Confluence `NS/2068774948`, May 2026) - stated purpose is to "ensure successful Neo account creation and purchase completion by enabling users to self-serve through guided conversational flows." Entry point "Buy a Neo plan" leads to Mail/Site/Both, then Features, Domain, Pricing & plans, Payment & checkout. Has a Loom and two Miro flowcharts.

3. **Spec: Chat support during purchase and onboarding** (Confluence `NP/1497497607`) - live human chat on `/select-plan`, `/checkout`, `/pricing-and-plan`.

**Not yet verified:** whether the KR1 bullet has entered design/PM phase. This was an open action item.

### Strategic counter-argument to expect
The 2026 strategy states the co.site persona "demonstrates weak retention and net-negative MRR" and that "continued over-indexing on newly formed businesses is inefficient." A tool targeting users who do not yet know what Neo is skews toward that cohort. Suggested rebuttal: frame the tool as an intent **qualifier** that routes low-intent to free and high-intent to seat bundles and annual billing, mapping to KR4 (quality of users acquired) and the M3 retention health metric.

---

## 4. Supporting data

### Chat volume (Confluence `NS/1780645899`)
- Domain selection: 3,772 chats
- Website select plan: 1,687
- Website checkout: 707
- Neo pricing: 273
- Finding noted in that doc: many users were "simply inquiring whether a free plan exists / exploring options without strong purchase intent"

### Persona + retention dataset
File: `Neo_vs_Non-neo_clients.xlsx`, shared by Ajinkya Karale. Date range **15 Mar 2023 to 21 Feb 2024**.

Sheets:
- `Retention-Raw` - 33,024 rows, **18,399 unique orders after dedupe on `order_id`**. Persona fields joined to outcome.
- `Sheet13` - 13,968 rows, raw persona answers per order
- `Persona responses` - pre-pivoted with percentages, split co.site vs custom domain
- `Import (Persona)`, `Import (gmail)` - import behaviour cuts
- `Query` - the Athena SQL used to generate it
- `definition` - column definitions

**Data caveats:**
- ~2.5 years stale. Site Freemium has shipped, pricing has changed, strategy has shifted away from co.site since. Treat the *direction* of relationships as valid; do not quote the *levels* as current.
- Rows duplicate in `Retention-Raw`. Dedupe on `order_id`.
- `cancel_reason` filled for only 996 of 11,735 cancellations. Directional only.
- `import_emails_contacts` and `current_email_app` filled for only 2,484 of 18,399 orders (~13%). These are the most predictive fields and the least populated.

### Field coverage

| Field | Type | Filled |
|---|---|---|
| `signup_reason` | multi-select, 6 options + free text | 8,594 |
| `employee_count` | free text (numeric) | ~13,100 |
| `role_in_business` | free text | ~13,090 |
| `business_industry` | free text | ~13,085 |
| `import_emails_contacts` | single-select, 4 options | 2,484 |
| `current_email_app` | multi-select, 7 options + free text | 2,484 |

### Live question options (recovered from response data, no formal question bank exists)

**Q1 "Why are you signing up?"** (multi-select)
- Email with my company name @{domain} - 3,578 (41.6%)
- Free domain / Free {domain} - 2,117 (24.6%)
- Zero setup email - 1,317 (15.3%)
- Simple one-page site I can launch now! - 735 (8.6%)
- Read receipt email feature - 277 (3.2%)
- Others (free text) - 570 (6.6%)

**Q2 "Do you want to import?"** (single-select)
- No, don't want to import - 2,122 (85.4%)
- Yes, import emails - 207
- Yes, import both emails and contacts - 102
- Yes, import contacts - 53

**Q3 "What do you use today?"** (multi-select)
- Gmail website 946 (35.2%), Gmail mobile app 723 (26.9%), Microsoft Outlook 378 (14.1%), iPhone Mail 268 (10.0%), Mac Mail 53, Thunderbird 24, Others 294

**Q4** headcount, role, industry - all free text

### Retention findings (2023-24 window, computed from the file)

Baseline: **36% retained, 64% cancelled** (6,664 vs 11,735 of 18,399).

Retention rate by signal:
- Imported mail and contacts: ~82% (n=102, thin)
- Imported emails only: ~74%
- Came from Outlook / Gmail / iPhone Mail: 77-84%
- Sent from Neo plus another client: 56%
- Used site editor: 51%
- Clicked settings: 43%
- Never logged in: 21%

Other cuts:
- co.site 43% vs custom domain 29.5% (opposite of the strategy doc's assumption)
- Two-yearly billing 73% vs monthly 31%
- Trial plans ~29-30% vs paid ~43%
- 1-person businesses retain better than 5-10 person
- Median cancellation at day 9; 5.2% cancel within 24 hours

Base composition:
- 1 employee: 42% (5,531 of 13,099). 2 employees: 14.5%. 3: 7.4%. Roughly two-thirds under 3 people.

Data quality problem worth using in the pitch: **5,318 distinct `business_industry` strings** and 2,327 distinct `role_in_business` strings across 13,968 rows. Real values include "Pizza", "ONLINE STORE", "Consort", "repair", "purchase". Case variants counted separately. Neo cannot currently act on these fields.

**Pending:** requested a refreshed 4-quarter Athena pull from Moinuddin F and Darrel N, using the SQL in the `Query` tab. Not yet received. Schema may have drifted since 2024.

---

## 5. Technical architecture

### Environments (Confluence `TE/375586959`)

| | Website | Signup app |
|---|---|---|
| Staging | `neo.space/?env=staging` | `join-staging.neo.space` |
| Preprod | `neo.space/?env=preprod` | `join-preprod.neo.space` |
| Production | `neo.space` | `join.neo.space` |

- **Staging** is the only isolated tier: staging BLL, staging Medusa, **Stripe test keys**
- **Preprod uses live Stripe keys and prod BLL/Medusa.** Do not demo there.
- Staging domain namespace: `neostaging.space` (Personal), `mystaging.email` (Personal Plus), `cas.site` (Business). Production equivalents: `neo.space`, `my.email`, `co.site`. Plan mapping must target the right set per environment.
- Amplitude is not wired for staging. GTM and Hotjar are production-only.
- `neo.space/?env=uat` on production surfaces only test domains - viable fallback if staging access is not granted
- If anything touches production, use the `neotest` convention in email usernames and `utm_content`. Analytics filters on that string.
- QA runbooks with working staging test credentials: Confluence `NQ/821428437` (custom domain) and `NQ/673415172` (co.site)

**What "staging access" means:** browser access to `join-staging.neo.space`, a test login, Stripe test card `4242 4242 4242 4242`, possibly VPN. It does **not** include repo, CI, or deploy rights to Neo's signup app. Route for the request: DevOps ticket in the `FDO` Jira project. Precedent exists (staging provisioning ticket FDO-1653, Cello integration).

Android staging build is explicitly VPN-gated in the setup doc. Web URLs are not flagged that way. Untested whether `join-staging.neo.space` loads without VPN.

### Handoff pattern (Confluence `NP/2241986584`, Pixpa x Neo Integration Guide)

Documented pattern for an external property handing users into Neo's purchase flow:

```
https://join.neo.space/domain-selection
  ?utm_source=pixpa
  &handoff=<base64url JSON {v, domain, email, name}>
```

Neo detects `utm_source`, decodes the payload, lands the user pre-filled, then continues through plan selection, payment, confirmation as normal.

**Open items on that page:** the hash parameter name and the encoding/signing method are still TBD, and Neo has not shipped their side. Do not depend on this for the demo.

Fallback ladder:
1. Request a `utm_source` value and the encoder from whoever owns that spec
2. Walk the live funnel manually and record which query params already carry state between `/domain-selection`, `/select-plan`, `/checkout`
3. Hand off un-prefilled with the domain copied to clipboard; show prefill as a clearly-labelled mock

### Marketing site
`neo.space` runs on **Unbounce** (per Confluence `NP/344817667`), not a git repo. Embedding is a `<script>` tag pointing at a hosted bundle. That is a **GTM ask, not an engineering ask**. Documented testing pattern on the same page: duplicate the page and test through the duplicate. The site already supports `?env=staging` as a query param.

`join.neo.space` is a real codebase with a lambda. Not accessible. Not needed.

### Stack decisions taken

- Frontend: React + Vite, deployed to Vercel free tier. Hosting location is invisible to users; the experience still renders on `neo.space` via the Unbounce script tag.
- Backend: single serverless function or Flask as an LLM proxy. API key must never reach the browser.
- Transport: **plain HTTP POST + SSE** (`stream: true` on the Anthropic API). Vercel functions support streaming natively.
  - **gRPC ruled out** - cannot run natively in a browser, needs grpc-web plus an Envoy proxy
  - **WebSockets ruled out** - flow is turn-based request-response; adds connection state and does not fit serverless
- Perceived latency: prefetch likely next-question variants during the 4-6s the user spends reading and deciding. Combine with optimistic UI (animate transition on click, resolve model call underneath).
- Animation: **Framer Motion** (~50KB). Optional single WebGL shader gradient background (~20KB). CSS 3D transforms for card flips.
  - **Unity WebGL ruled out** - 10-30MB builds, will not embed cleanly in Unbounce
  - **three.js ruled out** - ~600KB and the reveal is a motion problem, not a 3D one
- Domain availability: **RDAP** (`rdap.org/domain/<name>`) - free, no auth, registry standard. Caveat: tells you if a domain is registered globally, not whether Neo sells that TLD. Neo's own domain search API is the better source if granted; if asking, also ask for the rate limit and whether it is CORS-enabled.
- Plan catalogue: hardcoded JSON. Pricing is public and also in Confluence `NS/1679589391`.
- **LLM returns structured profile JSON only. A deterministic rules table maps profile to plan.** Keeps pricing out of the model's hands.
- Environment switching: destination hostname behind an env var, not a code change.

Cost note: ~5 model calls per session, roughly $0.07, so $15 covers ~200 sessions. Enable prompt caching (~10% charge on cached re-reads).

---

## 6. Access asks

| Ask | Status | Route |
|---|---|---|
| Persona survey sheet | **Granted** by Ajinkya Karale | - |
| Refreshed 4-quarter Athena pull | Requested, pending | Moinuddin F / Darrel N |
| Neo brand assets (fonts, colours, logo, components) | Not requested | Design |
| Chatbot V2 Miro boards + Loom | Not requested | Linked in Confluence |
| API credit top-up (~$50) | Not requested | Ignite organisers |
| Neo domain search API | Not requested | Neo eng, needs function head approval |
| Handoff encoder + `utm_source` value | Not requested | Owner of the Pixpa spec |
| Staging access + Stripe test dashboard | Not requested | FDO DevOps ticket |
| Unbounce duplicated page | Not requested | GTM |

Framing that works for these: lead with the requirement, not the item. "To demo an end-to-end personalised purchase journey we need X; without it we can only mock the final step."

---

## 7. Build plan

**Day 1 priority:** clone the pricing page on Vercel with Neo brand assets and demo the whole journey from there. Zero external dependency. Show the Unbounce embed as the deployment story. Swap in real access only if it lands mid-hackathon.

**Design entry point:** do not replace the pricing page. Add "Not sure which plan? Answer 5 questions" opening a full-screen overlay. Reasons: does not block users who already know what they want, degrades gracefully if the script fails, and is cleanly A/B testable.

**The one screen that must be perfect:** the reveal. Available domain, mailbox names, draft site copy, materialising line by line. Everything else can be rough.

**Feature freeze at hour 36.** Ring-fence the final 4 hours for the pitch: narrative, demo script, measurement slide. Not leftover time.

**Measurement slide:** cannot A/B test in 48 hours. Instrument own funnel (quiz start, completion, handoff click) and present the measurement *plan* - variant vs standard pricing page, measured on Mail DPO and M3 retention, the metrics the 2026 strategy already uses.

**Cautions:** do not script traffic against Neo's production domain search. Do not create real orders. Build the handoff as a user-clicked link, not a silent redirect.

---

## 8. Quiz flow (current design)

1. **Hook** - "Not sure which plan? Answer 5 questions" on the pricing page. Full-screen overlay.
2. **Screen 1** - single free-text box: "What's your business?" Free text is the point; it is what justifies the LLM.
3. **Screen 2** - the guess. Model reflects back an inferred profile and asks for confirmation. Binary confirm/deny.
4. **Screens 3-4** - two tap-through questions. Import question (highest retention signal). Mail-only vs mail+site.
5. **Screen 5** - the reveal. Live-checked available domain, mailbox names, draft site copy. Plan and price shown quietly underneath. One CTA into the purchase flow.

Reuse the existing option sets from section 4 rather than inventing new ones - continuity with existing data. Fix the free-text fields: headcount as a slider, role and industry LLM-normalised.

Design for 1-3 person businesses. Do not build a 50-200 employee branch.

**Naming:** "Akinator" is a trademarked product. Fine as an internal shorthand, not as a shipped feature name.

---

## 9. Open items

- [ ] Confirm whether the KR1 persona bullet has entered design/PM phase at Neo Product
- [ ] Squad registration status (deadline was 21 Aug noon) - unconfirmed in chat
- [ ] Refreshed Athena data from Moinuddin / Darrel
- [ ] Test whether `join-staging.neo.space` loads without VPN
- [ ] Walk the live funnel manually and record existing query params

---

## 10. Separate idea, not for Ignite

**North browsing / AI summary tool.** Existing work: `THR1212/North-Abuse-Project-Flock-updates` - GitHub Actions plus Upstash Redis, polls the North API for project 142 every 5 minutes via cron-job.org, posts to a Flock channel.

Findings:
- **No North API documentation exists in Confluence.** Only process docs: OKR rituals (`TG/1121878063`), quarterly planning (`N2P/1179746373`).
- Confluence `TW/1661501454` (Dec 2025) states "Only OKRs to be kept on north" - engineering task tracking is consolidating into Jira. North is becoming *less* comprehensive over time.
- Implication: a tool built on North alone will increasingly miss the execution layer. Stronger framing would be stitching North's stated goals to Jira's actual movement and surfacing divergence.
- Does not fit Ignite's small-business theme. Better suited to Forge.

---

## 11. Uncertain / unverified

Flagged explicitly so nothing here gets treated as established:

- Whether Claude Design integrates directly with Claude Code - unknown, not covered by available product documentation. Practical workaround: screenshot designs into Claude Code.
- Whether the KR1 bullet is in design phase - not verified
- Whether `join-staging.neo.space` is reachable without VPN - not tested
- Whether the 2023-24 Athena query still runs against current schemas - unknown, tables may have been renamed
- The ~82% import retention figure rests on n=102. Directional only.
- Retention *levels* throughout section 4 are from a 2023-24 product state and should not be quoted as current.

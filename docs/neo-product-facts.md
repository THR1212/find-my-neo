# Verified Neo product facts

Everything here has a source. Nothing in this file is inferred from marketing copy alone.
**If you are about to claim Neo does something, check here first.** A hallucinated Neo feature
in front of the Neo product team is the worst failure this project can have.

Sources: Confluence `NP/698843154` (Spec - Neo AI Site Builder, Jul 2024) and a live walk of
`neo.space/ai-website-builder` → `join.neo.space` on 27 Aug 2026.

---

## Neo AI Site Builder — what it actually is

**It generates a ONE-PAGE landing site.** Not a multi-page website. Verified from the system
prompt in the spec:

> "You are a helpful assistant who helps generate a **one-page landing website** for Neo's
> customers who are either Solopreneurs or small businesses."

Do not describe it as a website builder in the general sense. One page, for solopreneurs and
small businesses, aimed at people who may never have built a site before.

### Its inputs — this is the handoff hook

The builder asks for exactly **two** things, saved together as **Business details** and reused
across regenerations:

| Field | Limit | Notes |
|---|---|---|
| Business name | 55 chars | Can be AI-generated from the domain SLD, e.g. `acmedesigns.co.site` → "Acme Designs" |
| About the business | 2000 chars | Free paragraph. Has a "See examples" helper. |

**Our flow produces both of these and more.** That is the natural integration point — not a
new API, just the two fields their builder already consumes.

### What it generates

From the prompt's JSON schema — these section names are real:

`header`, `intro`, `custom_links`, `services_section`, `text`, `gallery_section`,
`product_section`, `testimonial_section`, `contact_form`, `social_links`

The AI picks: industry, template, sections and how many, colour theme, font, all section text,
and image search keywords. Images come from **Pexels** via search prompts, not generation.

### Regeneration

Three options inside the builder, each behind a consent modal (they replace existing content):
- **Generate design** — template, colours, fonts. Note: picked **randomly** client-side from the
  industry, *not* by AI. Don't call this an AI feature.
- **Generate content** — replaces site text and images.
- **Start all over again** — both.

Element-level **Generate text** exists on specific fields, with two modes: *Create new text* and
*Rewrite text*. Regeneration is capped at 2 per prompt.

### Limits

- Daily request limit, **account-level** (one user exhausting it doesn't block another in the domain).
- Site generation and element generation share one collective limit.

### Provider

Neo's builder uses **GPT** ("Send the prompt to GPT"; the modal shows OpenAI terms). Same family
we're using — worth knowing, not worth making a point of.

---

## The builder IS the purchase flow — not a separate demo

This is the single most important thing on this page, and it narrows our claim.

`neo.space/ai-website-builder` → "Try it yourself for FREE" lands the user directly in
**`join.neo.space`**, the signup app, carrying `source_hook=purchaseFlow`. The AI builder is the
*entry point to buying*, not a sandbox that later hands off somewhere else. Describe → generate →
purchase is already one continuous flow that Neo owns end to end.

So do **not** pitch this as "we'll hand users into Neo's builder, which currently has no purchase
path". It has one. What we're actually proposing is entering that same funnel **earlier and
pre-qualified** — with the domain chosen, the mailbox count known, and the plan already fitted —
rather than at the category picker.

Full params observed: `?hExp=&page_variant=<page title>&source_hook=purchaseFlow&locale=en-US`

**Step 1 — category picker** (`/site/industry`), *not* free text. "Tell us what your site is
about", with a searchable taxonomy plus six popular industries.

**Step 2 — free text** (`/site/your-idea`), "Describe your business idea". Protected by a
Cloudflare Turnstile CAPTCHA.

## The generation API — captured from a real run (HAR, 28 Aug 2026, 02:57:53–02:58:32Z)

```
POST api.titan.email/neo/generate/unauth
```

**It is unauthenticated.** No login needed to generate a site. Also seen:
`POST api.titan.email/files/images/search/bulk/unauth` (image search) and
`POST api.titan.email/m/addPreAuthEvent` (pre-auth analytics). Images resolve from
**images.pexels.com**, confirming the spec.

**Request** — note `p` is a JSON *string*, not an object:

```json
{
  "crid": "w_28025755_GSPR_0_13d_322x",
  "t": "bi",
  "p": "{\"ik\":\"<industry_key>\",\"bd\":\"<business description>\"}"
}
```

`t: "bi"` = business idea. `ik` = industry key from the category step. `bd` = the free text.

**Response:**

```json
{"industryKey":"business_management_consulting",
 "templateKey":"fashion_store",
 "businessName":"Proof & Butter"}
```

**Two things this proves, and they are the strongest evidence we have.**

1. **Neo extracts `businessName` from the description automatically.** "Proof & Butter" was never
   typed into a name field. So the two inputs their builder needs — business name and description
   — are already derivable from one free-text box. Our handoff doesn't need a new API; it needs
   this payload.

2. **A wrong category produces a wrong design.** This run sent
   `ik: business_management_consulting` for a *bakery*, and the model returned
   `templateKey: fashion_store`. The **copy** came out correct — "Proof & Butter Bakery",
   "Delicious Custom Cakes for Every Celebration", "a two-person bakery located in Bandra" —
   because the description carried the signal. But the **template** was selected off the
   mismatched taxonomy value.

   So the category step is doing real harm: it feeds the 5,318-distinct-values mess *and* it
   steers design selection, while the free text is what actually understands the business.
   That is the argument for our approach in one screenshot.

**What the HAR does NOT show.** The capture ends at the three-design chooser
("Choose from AI-generated designs…" → "Edit this design"). There are **no plan, price, domain,
mailbox, cart or checkout calls anywhere in it.** So generation itself involves no upsell — but
this does not answer whether one appears *after* choosing a design. That needs a second capture
past "Edit this design".

Caveat on this run: the tester was already signed into a test account in that browser profile,
though the endpoints used were the `unauth` ones.

## The fresh-user flow — Darrel's actual question, answered

Walked 28 Aug 2026 in a clean profile, never signed in. Timeline from the HAR:

| Time | Step |
|---|---|
| 03:50:03 | `neo.space/ai-website-builder` |
| 03:50:48 | `join.neo.space/site/industry` — category picker |
| 03:51:06 | `app.neo.space/site/noAuth/onboarding` — describe your business idea |
| 03:51:08 | `POST /neo/generate/unauth` → **400** |
| 03:51:11 | retry → **400** |
| 03:51:32 | after re-picking a category → **200** |
| 03:51:54 | image search, resources |
| **03:52:12** | **`join.neo.space/site/sign-up` ← THE GATE** |
| 03:53:46 | `app.neo.space/site/edit/` — editor, now authenticated |
| 03:54:18 | `join.neo.space/site/select-plan` — plan selection |

**Darrel was right.** The site is generated *before* any account exists — `/neo/generate/unauth`
needs no login — and signup is demanded **after** you have seen your site, immediately before the
editor. Plan selection comes after that.

That ordering is the whole psychology of their funnel: show the thing first, ask for the account
once the user is invested. Worth respecting rather than fighting — our tool should hand over at
or before that point, not try to replicate it.

Note: the fresh-user run went **sign-up → edit → select-plan**, whereas the earlier signed-in run
went **design → domain-selection**. The path differs by auth state; don't assume one order.

## A real bug in Neo's live funnel

The first two generation attempts returned **HTTP 400**:

```json
{"error":"InvalidParameter","parameter":"in",
 "desc":"A required parameter is missing or invalid","statusCode":400}
```

The client had sent the **business description in the `in` field** (industry name) rather than an
`ik` (industry key):

```json
{"t":"bi","p":"{\"in\":\"We're a two-person bakery in Bandra…\",\"bd\":\"We're a two-person bakery in Bandra…\"}"}
```

`in` and `bd` were the same string. Generation only succeeded after going back and choosing a
taxonomy industry, which sent `ik: ecommerce_retail`.

So the category step isn't merely producing dirty data — on this path it **hard-fails
generation**, twice, with no useful message to the user. The exact UI action that triggers it
(free-text industry? "Skip this"?) still needs one reproduction to pin down; the screen recording
should show it.

*(And `ecommerce_retail` for a bakery produced `templateKey: bio_site` — a third different
wrong template for the same business, after `fashion_store` and `property`.)*

## The generation API in full — and why your "show Neo's designs" idea works

`POST api.titan.email/neo/generate/unauth` is one endpoint with a `t` (type) discriminator:

| `t` | Purpose | Input | Output |
|---|---|---|---|
| `bi` | business idea | `ik`, `bd` | `{industryKey, templateKey, businessName}` |
| `sc` | **site content** | `bn`, `bd`, `d`, `bks`, `requireBlocksAsList` | the **entire generated site** |
| `bn` | business name | `domainName` | a name, e.g. `oesbusiness…` → "OES Business Solutions" |

`t: "sc"` is the one that matters. It returns the complete site as structured JSON:

```
templateKey, industryKey, siteCategory, font, pallet, validResponse, blocks[]
```

with 17 blocks, each carrying real content:

`header` (title, logo_image) · `introduction` (heading, description, desktop/mobileCoverImage,
mainButton) · `fixed-widget` · `custom-links` · `products` (heading, productList) · `about-us` ·
`gallery` (imageList) · `appointment-booking` · `testimonials` · `faq` · `subscribe-newsletter` ·
`business-information` · `location-map` · `contact-form` · `social-links` · `page-footer` · `footer`

Plus `font` (e.g. `pacifico_quicksand`) and `pallet` (e.g. `bio_site_p4_v1`).

**So we do not need to iframe their editor.** We can call `t: "sc"` with our own `bn`/`bd` and
render a lightweight preview from the returned JSON — real headings, real copy, real images, real
palette. That is the "show Neo's actual designs, let the user pick" idea, and it is buildable.

**Before relying on it, three things to check:**
1. Whether it is callable **server-to-server** (our Vercel function) or only from a browser with
   Turnstile satisfied. This is the make-or-break question.
2. It is an **undocumented internal API**. Fine for a hackathon demo; shipping on it needs Neo's
   agreement.
3. It is unauthenticated *today*. That can change without notice.

## The handoff — solved, and it's just query params

After picking a design, Neo navigates to domain selection carrying **everything in plain query
parameters**. No base64, no signing, no encoder. The original brief listed the encoding as "TBD";
there isn't one.

```
https://join.neo.space/site/domain-selection
  ?browser=true
  &hExp=
  &locale=en-US
  &page_variant=<origin page title>
  &source_hook=purchaseFlow
  &siteCategory=professional_service
  &industryKey=business_management_consulting
  &email=<user email>
  &hasUsedAiFlow=true
  &bn=Proof+%26+Butter
  &bd=<the full free-text business description>
  &templateName=%7B%22key%22%3A%22property%22%2C%22value%22%3A%22Real+Estate%22%7D
  &templateKey=property
```

| Param | Meaning |
|---|---|
| `bn` | Business name — the two fields the builder needs… |
| `bd` | Business description — …and we already produce both |
| `industryKey` | From the category step |
| `siteCategory` | Coarser grouping, e.g. `professional_service` |
| `templateKey` / `templateName` | Chosen template; `templateName` is a JSON-encoded `{key,value}` |
| `hasUsedAiFlow` | `true` once the AI path was used |
| `source_hook` | `purchaseFlow` |
| `email` | Prefills the account |

**This means our CTA can be real, not a mock.** We can construct this URL with our own `bn` and
`bd` and drop the user into Neo's funnel pre-filled. Nothing needs to be requested from anyone.

### The template mismatch, again and worse

This run carried `templateKey=property` — **"Real Estate"** — for a two-person bakery, because
`industryKey` was `business_management_consulting`. The earlier generate call returned
`fashion_store` for the same business.

The copy was consistently right (the description drove it); the **template** was consistently
wrong (the category drove it). That is the clearest possible statement of the problem we solve.

## Darrel's question — ANSWERED, both upsells found

The full post-generation sequence, walked end to end on 28 Aug 2026:

**1. Design chooser** — three AI-generated variants, "Edit this design".

**2. Domain selection** — immediately next. *"Choose a domain to publish your site — Like
joesbusiness.com, a domain is essential for creating a personalized site."* Search box, plus a
"Use a domain I own" path.

**3. The recommended domain is a FREE `.co.site` subdomain.** Searching `joesbusinessjoesbusiness`
returns `joesbusinessjoesbusiness.co.site` tagged **RECOMMENDED** with a
**"Get my FREE domain"** button.

> This settles the open question. The 100% domain discount in the pricing sheet is the free
> **`.co.site` subdomain**, not a registrable custom domain. Recorded as fact; treat as
> subject to change.

**4. Site editor** (`app.neo.space/site/edit`) — the generated site loads for editing.

**5. The MAILBOX upsell lives inside the editor**, as a banner above the preview:

> ✨ **Get professional email hello@yourdomain for just ₹100/mo.** *Get it now*

₹100/mo matches the bundled Mail Starter figure in Neo's own pricing sheet — so mail is sold as
an in-editor upsell after the site exists, not as part of the initial flow.

**So: domain is upsold immediately after design; mail is upsold inside the editor.** Neither is
part of the profiling step, and neither is chosen *for* the user — which is the gap we fill.

Editor section list (real feature names, from the left panel): Header · Intro · Quick contact ·
About business · Services · Appointment Booking · Gallery · Links.

Also observed: `bll.titan.email/internal/ip-to-country` (geo → pricing currency) and
`bll.titan.email/external/cello/reward-details` (Cello referral).

### The taxonomy finding

The category search has a real taxonomy — `food` → *Food & Beverages*, *Food & Beverage
E-commerce*…; `retail` → seven options. But **`bakery` matches nothing**, and the raw string is
silently accepted as a custom entry.

This is the live mechanism behind **5,318 distinct `business_industry` values across 13,968 rows**
in the persona data. Reproducible in ten seconds. It is our strongest piece of evidence.

---

## Neo Sites plan pricing

Read live from the pricing table on `neo.space/ai-website-builder`, 27 Aug 2026. Discounted
first-year, billed yearly; struck-through list price in brackets.

| Plan | Price/mo | List | Storage | AI site generations |
|---|---|---|---|---|
| Basic | ₹269 | ₹449 | 1 GB | 20 |
| Plus | ₹359 | ₹599 | 10 GB | 500 |
| Growth | ₹899 | ₹1499 | 50 GB | Unlimited, latest model |

**These are SITE plans, not mailbox plans.** Mailbox pricing is not yet sourced — do not render
these next to a mailbox count.

---

## Confirmed feature names

Safe to reference; each appears in Neo's own spec or product navigation. This is the allow-list
that `src/lib/features.ts` draws from.

**Mail:** business email @yourdomain · mail and contact import · email tracking ·
AI Smart Write · Email Campaigns · Priority Inbox · Signature Designer · Email Templates · Drive

**Site:** contact forms (leads land in your inbox) · site analytics · templates · font and colour
themes · stock images (Pexels) · image gallery · product listing · service listing · testimonials ·
social links · custom domain · remove Neo branding

**Suite:** Neo Bookings (appointment scheduling) · Email Marketing

---

## Open / unverified

- Mailbox plan pricing — not sourced.
- Whether the KR1 persona bullet (`NP/1697185794`) has entered design/PM phase — the Ignite
  disqualification risk.
- Whether Neo upsells mailbox/domain *after* site generation. **Partly answered:** the HAR of a
  real run shows no plan/price/domain/mailbox/checkout call up to the design chooser. Still needs
  a second capture from "Edit this design" onward.
- How many design variants are generated — the run produced **three** to choose from, which the
  spec (2024) does not describe. Sites carry a "Made with Neo" badge and a WhatsApp widget.
- `Spec: Site offering` (`NP/787382478`) describes a site upsell flow with plan selection —
  worth reading before claiming our recommendation flow is novel.

---

## Source hierarchy — read this before claiming Neo does anything

Three sources, and they are good at different things. Using the wrong one is how a wrong claim
gets made confidently.

| Source | Authoritative for | Not authoritative for |
|---|---|---|
| **`static.flock.co/meta/plan/feature/config/en-US.json`** — public, no auth, 49 features with Neo's own `heading` + `description`. Captured from the live checkout 28 Aug 2026. | **Feature names and descriptions.** It is the file Neo's own checkout renders to customers. | Behaviour, intent, roadmap. |
| **Confluence** (e.g. `NP/698843154`, Jul 2024) | **How things work and why** — the one-page constraint, "Generate design" being random rather than AI, field limits, flow logic. | Current naming. Specs date; the site builder spec is over two years old. |
| **Live product walk + HAR** | **What actually happens now** — request shapes, ordering, where gates fall, bugs. | Anything not exercised in that run. |

**Rule: names come from the JSON, behaviour comes from Confluence, reality comes from the HAR.**

A mistake worth not repeating: `src/lib/features.ts` was first written from marketing-page
transcription, and its header then claimed Confluence verification. The Confluence spec had
verified the *site* claims only — it said nothing about mail feature names. One verification was
allowed to cover claims it never reached. Rebuilding from the JSON corrected four names
(AI Smart Write → **AI Email Writer**; Email Campaigns → **Campaign Mode**;
Email tracking → **Read Receipts**; and the full import heading).

### Settled by the catalogue

- `neo_domain` = *"maxdesigns.co.site domain"* — the **free .co.site subdomain**.
- `custom_domain` = *"Custom Domain Email — Domain you already own"* — Neo's "custom domain"
  feature means **bring your own**, not a purchase. Worth having straight before discussing pricing.
- `neo_site` = *"AI-powered site builder"*, illustration asset `one_page_site.png` — one page,
  consistent with the 2024 spec.

---

## Server-to-server test — CONFIRMED WORKING (28 Aug 2026)

Two single test requests from a terminal, no browser, no cookies, no `Origin` header, no
Turnstile. Both returned **HTTP 200**.

**`t: "bi"`** — plain `curl -X POST https://api.titan.email/neo/generate/unauth` with
`{"crid","t":"bi","p":"{\"ik\":\"ecommerce_retail\",\"bd\":\"…\"}"}` returned
`{"industryKey":"ecommerce_retail","templateKey":"offline_services","businessName":"Proof and Butter"}`.

**`t: "sc"`** — 9.2 KB of complete site content. Inner payload shape:

```json
{"bn":"Proof and Butter",
 "bd":"<description>",
 "d":{"template_key":"offline_services","industry_key":"ecommerce_retail"},
 "bks":null,
 "requireBlocksAsList":true}
```

Returned `templateKey`, `font` (`poppins_inter`), `pallet` (`offline_services_p1_v1`) and
**17 populated blocks** — e.g. header "Proof and Butter Bakery"; introduction "Delicious Custom
Cakes Just for You"; custom-links "See our cake designs" / "Follow us on Instagram" / "Contact
for custom orders"; products with a "Chocolate Celebration Cake". It picked the Instagram
detail out of the description unprompted.

**So the "show Neo's real designs, let the user pick" idea is buildable** from our own serverless
function. We do not need to iframe their editor.

**One gap:** images come back as *prompts*, not URLs —
`{"logo_image": {"prompt/url/img/bk:h": "bakery symbol"}}`. Resolving them to real pictures needs
the second endpoint, `POST api.titan.email/files/images/search/bulk/unauth`, which the browser
flow also calls (results are Pexels URLs). Untested server-side so far.

### The template instability — now four for one business

Same bakery description across four runs produced four different templates:

| Run | `industryKey` sent | `templateKey` returned |
|---|---|---|
| Signed-in walk | `business_management_consulting` | `fashion_store` |
| Handoff URL | `business_management_consulting` | `property` ("Real Estate") |
| Fresh-user walk | `ecommerce_retail` | `bio_site` |
| Server-side test | `ecommerce_retail` | `offline_services` |

Two of those pairs share an industry key and still differ, so this is not only the category
being wrong — template selection is itself unstable. A bakery has been a fashion store, an
estate agent, a link-in-bio page and an offline services business.

### Caveats before building on it

1. **Undocumented internal API.** Fine for a hackathon demo; shipping on it needs Neo's agreement.
2. **Unauthenticated today**, which can change without notice.
3. **Keep volume low and mark it.** These are production endpoints. Use the `neotest` convention
   and never loop over them.

### Image resolution — also works server-side

`POST api.titan.email/files/images/search/bulk/unauth`

Request (note it needs **`crid`**, same as the generate endpoint — omitting it returns
`400 InvalidParameter, parameter: "crid"`; a `gid` UUIDv4 is also required):

```json
{"crid":"w_neotest_2_000_test",
 "gid":"<uuid v4>",
 "industry_key":"ecommerce_retail",
 "sq":[{"qid":0,"q":"bakery symbol","bk":"header"},
       {"qid":1,"q":"custom celebration cake in bakery","bk":"introduction"}]}
```

Response: `{"respList":[{"qid":0,"url":"https://images.pexels.com/photos/…"}]}` — verified the
returned URLs load (HTTP 200, `image/jpeg`, ~150 KB).

`q` values come from the image prompts embedded in the `t: "sc"` blocks, and `bk` is the block key.

### The complete pipeline, all callable from our serverless function

1. `t: "bi"` → `{industryKey, templateKey, businessName}`
2. `t: "sc"` → full site: template, font, pallet, 17 content blocks (images as prompts)
3. `files/images/search/bulk/unauth` → resolves those prompts to real Pexels URLs

That is everything needed to render Neo's actual generated design ourselves. No iframe, no auth,
no CAPTCHA. Subject to the three caveats above — undocumented, unauthenticated *today*, and
production, so keep volume low and mark it `neotest`.

---

## Neo does not sell custom domains yet — the constraint this project is built around

**This is the most important product fact on this page.** Confirmed 31 Aug 2026.

On production today, the domain step offers exactly two things:

1. **A free `.co.site` subdomain** — "RECOMMENDED", "Get my FREE domain".
2. **"Use a domain I own"** — connect a domain you have already registered elsewhere.

There is **no custom-domain purchase**. You cannot buy `proofandbutter.com` from Neo.

### What that means for us

Our recommender suggests custom domains with prices, which Neo cannot fulfil today. That is
deliberate: **the tool is built for the custom-domain service Neo hasn't launched.** When it
ships, this integrates with it. Until then the handoff routes to "use a domain I own".

State it plainly rather than hiding it — "here is what this does the day you turn custom
domains on" is a stronger position than pretending it works now, and it is the reason the
project exists at all.

**Do not substitute `.co.site` to make the flow complete.** A free subdomain is not the product
being recommended, and swapping it in would quietly change what the tool claims to do.

> **Amended 2026-09-03 — `.co.site` is now shown, as a fourth option, never as a substitute.**
>
> Darrel's call, and the distinction the paragraph above was protecting still holds: nothing
> was swapped. The reveal recommends the same three registrable names in the same order, and
> `.co.site` is appended in a fourth, reserved slot — labelled **Free**, for the first billing
> cycle, which is what Neo's own sheet says (`plans.json` → `domain.promoInrPerMonth` is ₹0/mo
> on monthly and yearly). It never takes the hero slot, including when the DomScan lookup
> fails; see the ranking comment in `src/lib/domains.ts`.
>
> What changed is the reasoning. The paragraph above reads as "don't paper over the gap", and
> that is right — but it was also leaving the flow's one **working** option off a screen whose
> whole job is to land someone on a domain. Neo can sell `.co.site` today. Showing it costs no
> DomScan credit, and it turns "here is what this does the day you turn custom domains on"
> into "…and here is the one you can claim right now", which is a stronger position, not a
> weaker one. The custom-domain caveat is still on screen, now branched so it appears only on
> the names it is actually true of.
>
> Availability for it comes from `api/_lib/cositeService.ts`, not DomScan — DomScan checks
> registrations and `foo.co.site` is not one. Two things measured that day, both of which rule
> out the cheap approaches: **`*.co.site` is a DNS wildcard** (`zzqx7v9nonexistentstem.co.site`
> resolves to the same four A records as `co.site` itself), and **a 404 does not mean free** —
> the host returns an identical 404 for an unclaimed stem and for a claimed-but-unpublished
> one, and §9 of `docs/data-findings.md` found only 9,121 of 44,581 site orders were ever
> published — 79.5% invisible to a probe, and Darrel confirmed an unpublished site still
> exists as an active order, so those names are genuinely taken.
> So the fallback probe proves "taken" only, and `NEO_COSITE_CHECK_URL` is the seam for Neo's
> real endpoint.

### Handoff limitations, tested

- **No query param prefills Neo's domain search box.** Tested `domain`, `domainName`, `q`,
  `search`, `sld`, `searchTerm` — with a distinct probe value each and a no-param control.
  All empty. (An earlier "success" was stored browser state, not the URL — a false positive
  worth remembering.)
- **"Use a domain I own" is a `<button>` opening a modal**, not a route. Not deep-linkable.
- **A cold visitor may be bounced to `/site/industry`.** Fresh loads of
  `/site/domain-selection` — even carrying `bn`, `bd` and `hasUsedAiFlow=true` — redirected
  back to the category picker. Only a tab with existing Neo flow state stayed. So the handoff
  is not guaranteed to hold for someone arriving cold; worth one more capture to pin down what
  state it actually needs.

Current mitigation: the CTA copies the chosen domain to the clipboard on click, and the reveal
says so, so at least nobody retypes it.

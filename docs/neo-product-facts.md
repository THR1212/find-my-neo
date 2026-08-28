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

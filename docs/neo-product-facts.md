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
- Whether Neo upsells mailbox/domain *after* site generation. Blocked by the CAPTCHA; needs a
  manual run-through.
- `Spec: Site offering` (`NP/787382478`) describes a site upsell flow with plan selection —
  worth reading before claiming our recommendation flow is novel.

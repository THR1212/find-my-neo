# Titan Persona Analysis V2 — what's in it and what it's worth

Read on 2026-09-02. Two files, supplied outside the brief:

- `Titan Persona Analysis - V2_Acquisition_Table.csv` — 5,661 rows × 6 cols
- `Titan_Persona_Analysis_-_V2.pdf` — 8-page dashboard export

Neither is committed (both live outside the repo; the CSV would belong in the
gitignored `analysis/data/` if we keep it). Numbers below were read off rendered
chart images, so **treat them as ±0.01 reads, not exact values** — the PDF's text
layer carries labels and axis ranges but not bar heights.

---

## Read this before quoting any of it: the filters change between pages

| Pages | Filter | Scope |
|---|---|---|
| 1–2 | `partner_name: Neo Business` (p1 also `model: User custom domain`) | 29.9K domains / 55.6K accounts |
| 3–8 | **no partner filter** | **1.3M domains / 3.6M accounts — all of Titan** |

Pages 3–8 are Titan-wide, *not* Neo. Anyone quoting page 3 retention as "Neo's
retention" is wrong by two orders of magnitude in n.

**Unreconciled:** the CSV does not reproduce the PDF's own population mix for the
same stated filter — CSV has E-commerce & Retail at 11.7%, PDF p1 says 21.1%. The
CSV is 5,661 of 29.9K domains, so it is a partial extract of unknown selection.
**All CSV-derived percentages here are provisional until that is explained.**

---

## 1. The 16 / 103 industry taxonomy — the most useful thing in either file

`Industry` (16 values) → `Sub Industry` (103 values), applied to real domains.

Professional & Business Services, E-commerce & Retail, Healthcare & Wellness,
Nonprofits/Social Impact & Public Services, Technology & IT Services, Financial
Services, Logistics & Automotive, Media & Entertainment, Arts & Creative Services,
Education & Training, Food & Beverage, Marketing & Advertising, Travel & Hospitality,
Recreation & Sports, Manufacturing & Industrial, Construction.

This is the direct answer to the 5,318 problem, and it is **Titan's own**, applied at
1.3M-domain scale. `src/lib/session.ts` currently calls our `normalizedIndustry` "the
fix" for the 5,318 mess — adopting this taxonomy instead makes the narrowing
defensible as *Neo's own categories* rather than ours, which is much harder to argue
with in front of the product team. 103 sub-industries is about the right granularity
for the meter to collapse into.

## 2. Industry barely predicts plan choice — provisional assumption-killer

From the CSV (paid only, n=5,470). `ultra` share by industry runs 7.0%
(Manufacturing & Industrial) to 22.6% (Construction) against a 15.3% baseline —
looks dramatic, but **Cramér's V = 0.087**, below the 0.1 "small effect" floor.
Significant, practically negligible.

`model` × `plan_type` is slightly stronger (V = 0.109) but still small.

If it holds on the full population: **asking industry in order to pick a plan is close
to worthless.** The taxonomy's value is normalisation and narrowing *experience*, not
the recommendation. Provisional — see the reconciliation gap above.

## 3. Industry predicts retention only at 12 months (Titan-wide, p3)

| Horizon | Range across 16 industries |
|---|---|
| M1 | 0.92 – 0.96 — flat, no signal |
| M3 | 0.84 – 0.93 |
| M6 | 0.79 – 0.90 |
| **M12** | **0.59 – 0.76 — 17pt spread** |

M12 by industry, worst to best (read off chart):

- Financial Services 0.59, Technology & IT 0.61, E-commerce & Retail 0.62,
  Marketing & Advertising 0.63, Logistics & Automotive 0.65
- Education & Training 0.69, Recreation & Sports 0.71, Media & Entertainment 0.72,
  Food & Beverage 0.72, Construction 0.72, Nonprofits 0.73
- Healthcare & Wellness 0.73, Travel & Hospitality 0.73, Professional & Business
  Services 0.74, Manufacturing & Industrial 0.75, **Arts & Creative Services 0.76**

**Counterintuitive and worth saying out loud:** the "sophisticated" segments — fintech,
tech, e-commerce, marketing — churn *most*. The unglamorous ones stick. Plausibly they
outgrow Neo or have alternatives; the data here can't distinguish.

## 4. Trial conversion discriminates far better than plan choice (p7)

45% – 69% across industries — a 24-point spread, and it **tracks M12 retention in the
same direction**:

- Worst: Technology & IT 45%, E-commerce & Retail 53%, Financial Services 54.5%
- Best: Arts & Creative 69%, Healthcare & Wellness 68%, Nonprofits 67.5%,
  Media & Entertainment 66%, Recreation & Sports 66%

Two independent measures agreeing is the strongest signal in either file: some
industries are simply better fits for Neo. That is a real segmentation finding.

`Pro to Higher plan upgrade` is low everywhere (0–7%) and sparse — several industries
show no bar at all.

## 5. What actually makes people pay — "Last Paywall Click" (p7)

**Freemium → paid.** `Storage Banner` is the single dominant trigger in *every*
industry: **32% – 52%** of conversions. Highest Construction ~52%, Manufacturing ~47%,
Travel ~45%; lowest Technology / Arts & Creative / Recreation ~32%. `NA` (no recorded
click) is ~25–37%. `Read Receipt` is the #2 real feature at ~8–12%. Everything else —
Attachment & Link tracking, Undo Send, Signature Builder, Email Template, Higher
Sending Limits, Grammar & Spell Check, Block — is low single digits.

**Pro → higher.** `NA` dominates at ~33–48%, i.e. **most upgrades are not paywall-
driven at all**. Of those that are, `Read Receipt` leads (~5–12%), then Storage Banner,
Attachment & Link tracking, Signature Builder, Schedule Send, Email Template, HTML,
Email campaign.

For a *pre-purchase* quiz this is the most directly relevant data in either file: it
says which job to ask about, because it records which job converted.

## 6. Neo domains really are tiny — validates the 1–3 person assumption (p2)

`Avg Accounts` per domain, **1.54 – 2.28 across all 16 industries** (~1.9 overall).
Lowest Arts & Creative 1.54, E-commerce 1.68, Food & Beverage 1.71. Highest
Manufacturing 2.28, Financial Services 2.17, Travel 2.07, Technology 2.05.

The product's deliberate lack of a 50–200 branch looks right. Nobody is close to it.

**`Generic Accounts Percent` 0.39 – 0.64 — the more interesting number.** E-commerce
& Retail is highest at ~0.64; most industries sit 0.44–0.54; Education lowest ~0.39.

So roughly **half of all Neo mailboxes are generic role addresses** (info@, sales@,
support@), not named people. That reframes the team-size question at
`src/lib/questions.ts:137`: "how many of you are there?" is asking about headcount when
the thing being bought is *addresses*. "How many addresses do you need — info@,
sales@, bookings@?" would match what people actually do, and would land better with a
solo operator who wants three role addresses.

## 7. Also present, not yet extracted

- p4 `Net Amount Collected` + avg by industry (median avg ≈ 66) — which industries are
  worth optimising the funnel for
- p5 mail volume per account (sent / read / received, bucketed) by industry
- p6 NPS + NPS response count by industry
- p8 feature adoption by industry: Read Receipt, Insert HTML, Signature Builder,
  Grammar & Spell Check, Email Template, Schedule Send, Calendar — would sharpen the
  Reveal screen's "what you'll actually use"

---

## What to ask for next

The dashboard's filter row reveals the underlying table carries far more than the
6-column CSV we were given: `mbx`, `clean_source`, `age_months`, `country`,
`mbx_segment`, `geo_type`, `status`, `billing_cycle`, `last_paywall_clicked_free`,
`last_paywall_clicked_pro`, and M1–M12 retention.

**Request a CSV export with those columns, filtered to `partner_name: Neo Business`.**
The paywall-click and retention fields are what would let us order the quiz questions
by evidence instead of by guess — and a Neo-filtered export would settle the
representativeness gap in §0 at the same time.

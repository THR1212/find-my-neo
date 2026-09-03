# Data findings

What we have actually computed, from which file, with denominators. Written 2026-09-02.

This corrects and extends the unverified claims in `docs/handoff.md` §4 and
`docs/demo-script.md`. Where a number here disagrees with one of those, **this file is
the one that was computed from source** — but read the caveats, because two of the three
sources turn out not to be representative.

Scripts: `analysis/scripts/persona_stats.py`, `analysis/scripts/retention_cuts.py`,
`analysis/scripts/field_coverage.py`, `analysis/scripts/athena_retention.py`,
`analysis/scripts/site_usage.py`. Machine-readable output: the matching `.json` files in
`analysis/output/`.
Raw exploration log for the V2 dashboard: `analysis/output/titan-persona-notes.md`.
Competitor research lives separately in `docs/competitor-qualification.md`.

## Sources

| Source | Unit | Size | Notes |
|---|---|---|---|
| `Neo_vs_Non-neo_clients.xlsx`, `Sheet13` | order | 13,968 rows | persona fields; 2023-03-15 → 2024-02-21 |
| `Neo_vs_Non-neo_clients.xlsx`, `Retention-Raw` | order | 33,024 → 18,399 deduped | retention + the §4 claims |
| `Titan Persona Analysis - V2` (CSV + 8pp PDF) | domain | 5,661 / 1.3M | dashboard export; **filters change between pages** |
| `persona data with athena.xlsx`, `athena_data` | account | 153,673 | retention + segments; joins to persona on domain |
| `neo site order data.xlsx`, `athena site data` | order | 44,581 | site feature usage; **only 723 on a paid plan** (§9) |

All of them live in the gitignored `analysis/data/`. None are committed.

**They do not agree with each other**, and that is the most important thing on this page.
Retention is measured differently in each (end-state flag, monthly cohort flags, 3-way status),
the populations differ, and two of the five are not representative. Compare orderings between
segments; do not carry a level from one source into a sentence about another.

---

## 1. The 5,318 counter is correct — confirmed

The number the app opens on (`STARTING_SETUPS` in `src/lib/engine.ts`) had never been
recomputed. It is right, exactly:

| Claim | Computed | |
|---|---|---|
| 13,968 rows | 13,968 | confirmed |
| 5,318 distinct `business_industry` | **5,318** (n=13,833 non-null) | confirmed |
| 2,327 distinct `role_in_business` | **2,327** (n=13,842) | confirmed |
| "Pizza", "ONLINE STORE", "Consort", "repair", "purchase" | all present | confirmed |

No code change needed. The demo script's examples are all real ("repair" n=36,
"ONLINE STORE" n=9, "Pizza" n=2, "Consort" and "purchase" n=1 each).

**Two corrections to the brief:** the fields live in `Sheet13`, not `Persona responses`
(which is a pivot summary with no per-order rows). And `Sheet13` has no date column —
the date range above is recovered by joining `order_id` to `Retention-Raw`.

**Three things that strengthen the argument, now quantified:**

- **1,128 of the 5,318 are the same answer typed differently.** Normalising case and
  whitespace collapses it to 4,190. So ~21% of Neo's "industries" are duplicates the
  field cannot see.
- **77.8% of distinct values appear exactly once** (3,262 singletons). A category with
  one member cannot route anything.
- **`1` is the third most common value** (546 occurrences, behind `sales` 1,316 and
  `marketing` 823). Someone's numeric answer landed in a free-text industry field.
  Arguably a better one-liner than "Pizza".

The number survives the brief's rule-4 dedupe on `order_id` intact: 5,311 distinct
across 13,406 unique orders (`Sheet13` carries 513 duplicate `order_id` rows).

## 1b. The brief's §4 retention table — every claim confirmed

Recomputed from `Retention-Raw`, deduped on `order_id` per rule 4 (33,024 rows → 18,399
unique orders; 14,625 rows repeat an `order_id`, 14,387 of them byte-identical).
Script: `analysis/scripts/retention_cuts.py`.

| Claim | Computed | n | |
|---|---|---|---|
| Baseline 36% retained / 64% cancelled | **36.2%** — 6,664 vs 11,735 | 18,399 | confirmed |
| Two-yearly 73% vs monthly 31% | **73.0% vs 30.9%** (2.4×) | 393 / 12,367 | confirmed |
| co.site 43% vs custom domain 29.5% | **42.9% vs 29.5%** | 9,210 / 9,189 | confirmed |
| Never logged in 21% | **21.0%** | 3,496 | confirmed |
| Imported mail + contacts ~82% (n=102) | **82.4%**, n=**102** | 102 | confirmed, n exact |
| Imported emails only ~74% | **74.4%** | 207 | confirmed |
| Outlook / Gmail / iPhone Mail 77–84% | 81.0 / 77.1–79.7 / 76.1 | 378 / 1,669 / 268 | confirmed |

Yearly sits between at 45.3% (n=5,639). Whoever produced these numbers did it correctly
— the levels and denominators all reproduce.

**The `rules.ts` yearly default is justified** on this source at 2.4×, and independently
on the Athena export at 5.9× (§2). Two sources, same direction, different magnitudes.

**The co.site row remains contested.** It is confirmed *here* (co.site ahead by 13pt) but
the Athena export reverses it (custom domain 38.2% vs co.site 33.4%), and the 2026
strategy doc assumes the opposite of this sheet. Do not quote it either way yet.

## 1c. The import-intent claim is a selection effect — this one should change the flow

`docs/handoff.md` reads the ~82% retention of "imported emails and contacts" as import
intent being the strongest signal, and `src/lib/questions.ts:70` **leads the entire flow
with the import question because of it**. That reading does not survive contact with the
data.

**"No, don't want to import" retains at 79.5% (n=2,122)** — against 82.4% for "Yes,
import both". The whole spread between answers is 8.6 points. What separates people is
whether the field is filled at all:

| | Retained | n |
|---|---|---|
| import field answered | **79.3%** | 2,484 |
| import field blank | **29.5%** | 15,915 |

A **2.7× gap** from answering, versus 8.6 points from the answer. And it is not a proxy
for something else — it survives holding login fixed (75.6% vs 17.7% among non-loggers;
79.6% vs 32.6% among loggers) and holding billing cycle fixed (75.5% vs 22.8% monthly;
90.7% vs 41.2% yearly).

Nor is it "answering anything is good". The fields asked at signup go the *other* way,
which is exactly what marks import as a later-stage field:

| Field | Answered | Blank |
|---|---|---|
| `import_emails_contacts` | 79.3% (n=2,484) | 29.5% (n=15,915) |
| `current_email_app` | 79.3% (n=2,484) | 29.5% (n=15,915) |
| `signup_reason` | 43.1% (n=7,714) | 31.2% (n=10,685) |
| `employee_count` | **33.0%** (n=13,099) | **44.1%** (n=5,300) |
| `role_in_business` | **33.0%** (n=13,091) | **44.1%** (n=5,308) |
| `business_industry` | **33.0%** (n=13,085) | **44.1%** (n=5,314) |

`import_emails_contacts` and `current_email_app` are filled on the *same* 2,484 orders,
far fewer than the signup-time fields — they sit later in Neo's onboarding. So the 79%
measures **having progressed through onboarding**, not a preference.

**Why this matters for the product:** the app asks the import question *before purchase,
to a cold visitor*. The retention it is justified by was measured on people who answered
it *after* signing up and getting some way in. The signal is not available at the moment
the app tries to use it — a feature that leaks the outcome. Leading the flow with it is
not supported.

## 1d. What the quiz could actually know before purchase

Split by availability, which is the distinction that matters for question design:

**Usable pre-purchase, strongest first**

| Signal | Spread | |
|---|---|---|
| Billing cycle | two_yearly 73.0% / yearly 45.3% / monthly 30.9% | strongest by far |
| Paid vs trial start | 43.0% vs 29.4% | real |
| co.site vs custom domain | 42.9% vs 29.5% | contested — see §1b |
| Signup reason (which one) | 40.5%–46.5% | weak, 5.9pt spread |
| Mailbox count | 34.1%–40.1%, non-monotonic | weak/noisy |

**Not knowable pre-purchase** (strong, but post-signup): import field answered 79.3%,
`current_email_app` answered 79.3%, logged in 39.8% vs 21.0%, used the site editor
50.5% vs 34.5%, clicked settings 43.0% vs 33.5%.

Note that **mailbox count is flat here (34–40%) but fell sharply in the Athena export**
(m12 7.4% → 2.1% as mailboxes rose). Another non-replication — see the caveats.

## 2. Billing cycle predicts retention strongly — the `rules.ts` default holds

`src/lib/rules.ts` defaults to yearly billing *because* of the brief's "two-yearly 73%
vs monthly 31%". Those levels are wrong; the direction is dramatically right.

m12 retention by billing cycle (n=153,673 accounts):

| Cycle | m1 | m6 | m12 | n |
|---|---|---|---|---|
| two_yearly | 36.6% | 24.7% | **22.0%** | 2,899 |
| four_yearly | 26.1% | 16.2% | **14.8%** | 1,480 |
| yearly | 21.4% | 10.5% | **8.5%** | 48,763 |
| quarterly | 25.1% | 12.0% | **8.3%** | 2,627 |
| monthly | 23.9% | 6.1% | **3.7%** | 84,811 |

**5.9× two_yearly over monthly at m12**, against the brief's claimed 2.4×.

It is not mailbox count in disguise. Holding segment fixed, the gradient survives
everywhere:

| m12 % | 1 mbx | 2–5 | 6–20 |
|---|---|---|---|
| two_yearly | 29.8 | 17.3 | 16.6 |
| monthly | 4.3 | 3.7 | 3.7 |

**Caveat that belongs in the pitch before someone else says it:** this is
correlational. Committing to two years does not *cause* retention — the kind of
customer who commits is the kind who stays. A yearly default may sort customers
rather than save them.

## 3. Retention decreases with size — backwards, and it validates our scope

| Mailbox segment | m1 | m6 | m12 | n |
|---|---|---|---|---|
| 1 | 30.9% | 10.1% | **7.4%** | 54,911 |
| 2–5 | 19.7% | 7.0% | **5.0%** | 64,500 |
| 6–20 | 17.4% | 6.0% | **3.9%** | 24,938 |
| 21+ | 10.6% | 3.8% | **2.1%** | 9,324 |

Solo operators retain **3.5× better** than 21+ accounts. This turns the product's
deliberate lack of a 50–200 branch from a scoping decision into a retention argument:
the small end is Neo's best-retaining segment, not a compromise.

Consistent with the V2 dashboard, where **average accounts per domain is 1.54–2.28
across all 16 industries** (~1.9 overall). Nobody is near the big end.

## 4. Plan type is a clean monotonic signal

m12 retention, joined subset (see §6 for why levels are inflated): ultra 44.4% →
premium 42.9% → pro 31.8% → lite 30.5%. No reversals. Higher plan, better retention.

Also: `User custom domain` 38.2% vs `co.site` 33.4%. **This contradicts the brief's
"co.site 43% vs custom domain 29.5%", which had co.site ahead** — and it agrees with
the 2026 strategy doc instead. Worth resolving before anyone quotes either.

## 5. What actually makes people pay

From the V2 dashboard, "Last Paywall Click" by industry:

- **Freemium → paid: `Storage Banner` is the dominant trigger in every single
  industry, 32–52%** of conversions. `NA` (no recorded click) 25–37%. `Read Receipt` is
  the #2 real feature at 8–12%. Everything else — Attachment & Link tracking, Undo
  Send, Signature Builder, Email Template, Higher Sending Limits, Grammar & Spell
  Check — is low single digits.
- **Pro → higher: `NA` dominates at 33–48%** — most upgrades are not paywall-driven at
  all. Of those that are, `Read Receipt` leads (5–12%).

For a pre-purchase quiz this is the most directly useful data we have: it records which
job converted. Storage and mailbox headroom deserve a question; most of the feature
list does not.

Trial conversion also discriminates well — **45% (Technology & IT) to 69% (Arts &
Creative)**, a 24-point spread, and it tracks the dashboard's M12 ordering.

## 6. Industry is a weak and unstable predictor — three independent reasons

This is the finding that should change the product, and it cuts against our own flow.

1. **It barely predicts plan choice.** `ultra` share runs 7.0% (Manufacturing) to 22.6%
   (Construction) — looks dramatic, but **Cramér's V = 0.087**, below the 0.1
   "small effect" floor. Significant, practically negligible.
2. **It only separates retention at 12 months.** In the dashboard, M1 is flat
   (0.92–0.96) and only M12 spreads (0.59–0.76). Early churn is driven by something
   other than industry.
3. **The ordering does not replicate between our two sources:**

   | Industry | Athena export | V2 dashboard |
   |---|---|---|
   | Manufacturing & Industrial | high (46.1%) | high (0.75) |
   | Financial Services | low (32.4%) | worst (0.59) |
   | Nonprofits | **worst (30.8%)** | **good (0.73)** |
   | Healthcare & Wellness | **low (33.7%)** | **good (0.73)** |

   Two agree, two flip completely.

**What industry *is* good for:** the V2 taxonomy — **16 industries / 103
sub-industries**, applied at 1.3M-domain scale — is Titan's own answer to the 5,318
problem. Adopting it in `src/lib/session.ts` makes the narrowing defensible as *Neo's
own categories* rather than ours. Its value is normalisation and the narrowing
experience, not the recommendation.

## 7. Half of all Neo mailboxes are role addresses, not people

Dashboard `Generic Accounts Percent` runs **0.39–0.64** by industry; E-commerce &
Retail highest at ~0.64, most industries 0.44–0.54.

This reframes the team-size question at `src/lib/questions.ts:137`. "How many of you
are there?" asks about headcount when the thing being bought is *addresses*. "How many
addresses do you need — info@, sales@, bookings@?" matches what people actually do, and
lands better with a solo operator who wants three role addresses.

## 8. Field coverage — "least populated" confirmed, "most predictive" contradicted

Script: `analysis/scripts/field_coverage.py`. Output: `analysis/output/field_coverage.json`.

**The coverage half of the pitch line is exactly right.** On `Retention-Raw` deduped:
`import_emails_contacts` and `current_email_app` are each filled on **2,484 of 18,399
orders = 13.5%**, precisely as claimed.

Both numbers that have been floating around are correct — they are different sheets:

| Sheet | Filled | Share |
|---|---|---|
| `Retention-Raw` (18,399 deduped orders) | 2,484 | **13.5%** ← the brief's number |
| `Sheet13` (13,968 rows) | 2,667 / 2,669 | **19.1%** |

Always say which sheet. And for context on `Sheet13`: `employee_count` is filled on 99.1%,
`signup_reason` 58.0%.

**A detail that settles the mechanism:** the two fields cover the *identical* 2,484 orders
— zero orders have one filled without the other. That is what two questions sitting on the
same later onboarding step look like, and it is why "answered" is a progress marker.

### The "most predictive" half is backwards

The claim conflates three different numbers. Separating them:

- **coverage** — how often the field is filled
- **V** — Cramér's V between *which answer was given* and retention, on answered rows only,
  over answer values with n≥30. This is what "predictive" should mean.
- **gap** — retention when filled minus when blank. The selection effect.

| Field | cov % | V | levels | gap pt |
|---|---|---|---|---|
| `business_industry` | 71.1 | 0.350 ⚠ | 41 | −11.1 |
| `role_in_business` | 71.2 | 0.192 ⚠ | 25 | −11.1 |
| **`billing_cycle`** | 100.0 | **0.177** | 3 | — |
| `login_tag` | 100.0 | 0.153 | 2 | — |
| `client_used` | 100.0 | 0.147 | 4 | — |
| `neo_offering` | 100.0 | 0.140 | 2 | — |
| `employee_count_modified` | 71.2 | 0.122 ⚠ | 20 | −11.1 |
| `signup_reason` | 41.9 | 0.064 | 4 | +11.9 |
| **`current_email_app`** | 13.5 | **0.058** | 8 | **+49.8** |
| `mailbox_count` | 100.0 | 0.051 | 10 | — |
| **`import_emails_contacts`** | 13.5 | **0.041** | 4 | **+49.8** |

⚠ = high cardinality inflates V; only ~a third of answered rows clear n≥30. Don't read
these as beating `billing_cycle`.

**`import_emails_contacts` is the weakest of the 11 non-leaky fields** (rank 1 of 11) and
`current_email_app` is third weakest. `billing_cycle` is **4.3× more associated on fewer
levels** (3 vs 4), so this is not a cardinality artifact.

What made them look predictive is the **+49.8pt answered-vs-blank gap — the largest of any
field** — which §1c shows is selection, not signal.

Three fields are excluded as outcome leaks: `status` (V=0.943 — it *is* the retention flag),
`plan_type` (0.379) and `init_plan_type` (0.142). Recorded so nobody rediscovers them.

### The pitch line, rewritten

The brief calls "most predictive, least populated" one of the strongest things in the pitch.
As written it will not survive a data-literate question. The honest version is stronger,
because it indicts the whole persona survey rather than one field:

> Neo asks six persona questions. The best-covered of them — industry, filled on **99.0%**
> of rows — has **5,318 distinct values, 78% of them appearing exactly once**, so it routes
> nothing. The two fields that look most predictive are filled on **13.5%** of orders, and
> their apparent power is an artifact: *"No, don't want to import"* retains at **79.5%**
> against 82.4% for *"yes, both"*. Meanwhile the strongest retention signal in the whole
> dataset — **billing commitment, 73.0% two-yearly vs 30.9% monthly** — is never asked as a
> question at all. It is a checkout radio button.

(Coverage figures in that paragraph are `Sheet13`; the 13.5% and the retention rates are
`Retention-Raw` deduped. The six fields are `signup_reason` 58.0%, `employee_count` 99.1%,
`role_in_business` 99.1%, `business_industry` 99.0%, `import_emails_contacts` 19.1%,
`current_email_app` 19.1%.)

Every number in that paragraph is computed in this repo, with `n`, from source.

---

## Caveats that apply to everything above

- **The acquisition table is not representative.** Its 5,661 domains join to only 2,700
  Athena domains (47.7%), and that joined subset retains at **30–48% m12 while the full
  population sits at 5.5%** — a 6–8× gap. It is selected toward survivors/payers. Every
  industry/plan/model level in §4 and §6 comes from it, so **read the orderings, not the
  levels.** Its own industry mix also disagrees with the dashboard's for the same stated
  filter (E-commerce 11.7% vs 21.1%), still unexplained.
- **Dashboard filters change between pages.** Pages 1–2 are `Neo Business` (29.9K
  domains). Pages 3–8 have **no partner filter — 1.3M domains, all of Titan, not Neo.**
  Quoting page 3 retention as "Neo's retention" is wrong by two orders of magnitude in n.
- **Retention measures are not comparable across sources.** Athena `m1_retained`
  averages 22.8%; the dashboard shows M1 ≈ 94%. 1,048 Athena rows have m12=1 while
  m1=0, so the flags mean "active in month m", not "survived continuously to month m".
- **Dashboard numbers were read off rendered charts** (the PDF's text layer has labels
  and axis ranges but not bar heights). Treat them as ±0.01 reads.
- **Unit differs by source:** order (Sheet13), domain (dashboard), account (Athena).
  153,673 accounts over 81,670 domains.

## Data-hygiene problems to report back

- **Excel mangled `mbx_segment` on export.** Labels `2-5` and `6-20` arrived as dates
  `2026-02-05` and `2026-06-20`. Decoded in `athena_retention.py`, but fix it at source.
- **`mbx` is constant (always 1) and `geo_type` is entirely empty** in the Athena
  export — both useless as shipped.
- **Andorra and Angola look like junk traffic:** 1,266 and 1,886 accounts at **0.1% and
  0.0% m12**, m1 ~1%. With "Unclear" (13,158 accounts, 1.0% m12) that is ~16K accounts
  of probable bot/abuse signup dragging global averages down. Someone should decide
  whether they belong in the denominator.
- Real geography signal once that is set aside: Australia 10.1%, UK 9.4%, Canada 8.8%,
  UAE 7.5% vs India 1.6%, Nigeria 1.9%. And `mobile_order` retains **3× worse** than
  `Neo Site` (1.8% vs 5.9%, n=12,889 vs 140,092).

## Still not done

- **The co.site vs custom-domain contradiction now has three readings and no winner:**
  `Retention-Raw` says co.site 42.9% vs custom 29.5% (§1b), Athena reverses it (custom 38.2%
  vs co.site 33.4%, §4), and the site data says neither — custom 54.2% vs co.site 56.0%, a
  1.8pt gap (§9). The 2026 strategy doc assumes the opposite of the first. **Do not quote
  this in any direction.** Note §9 does find a real domain signal, just not that one:
  `domain_ownership_verified` is +16pt. "Did they finish connecting a domain" looks like the
  variable that matters, not "which kind of domain did they get".
- **Mailbox count** is flat in `Retention-Raw` and steeply negative in Athena (§1d).
  One of the two measures is not what we think it is.
- The dashboard's per-industry revenue (p4), mail volume (p5), NPS (p6) and feature
  adoption (p8) are extracted only as ranges, not per-industry values.
- **Worth requesting:** a Neo-filtered Athena export with `last_paywall_clicked_free` /
  `last_paywall_clicked_pro` at row level. The paywall fields only exist as dashboard
  aggregates today, and they are the strongest basis we have for ordering quiz questions.

---

## 9. What people actually do with a Neo site (added 2026-09-03)

Source: `neo site order data.xlsx`, sheet `athena site data` — 44,581 orders, 16 usable
feature flags, 3-way retention status, Titan's taxonomy alongside Neo's raw free text.
Script: `analysis/scripts/site_usage.py`. Output: `analysis/output/site_usage.json`.

**Gating caveats.** Only **723 of 44,581 orders are on a paid site plan** (basic 322, plus 279,
growth 122) — everything else is beta or free, so plan-level numbers are directional.
`freeplan_site` is 97.8% published and 93.5% retained, which looks like a plan granted *after*
publishing rather than one that causes it. `used_external_links` duplicates
`used_site_published` (differ on 2 of 44,581 rows) — one signal, not two. `used_dns_record` is
constant 0. Retention is a 3-way flag on a different population, so compare orderings with the
rest of this doc, not levels.

### Generating a site is not the value moment. Publishing is.

| | n | retained |
|---|---|---|
| generated ✗, published ✗ | 31,545 | 47.8% |
| **generated ✗, published ✓** | 5,589 | **91.7%** |
| generated ✓, published ✗ | 3,915 | 55.6% |
| generated ✓, published ✓ | 3,532 | 63.5% |

**Publishing lift +32.1pt — the largest of any flag. Generating lift +4.9pt — near nothing.**
And among people who published, those who never touched the generator retain *best*.

This is uncomfortable for us, because the reveal is built around Neo's generated site. It does
not sink the idea — our value is the qualification, and the generated site is a demo beat that
makes the reveal land. But **"we show them a generated site" is not a retention argument**, and
should not be made into one. If anything the data says the CTA's job is to get someone to
*publish*, and the handoff should be framed that way.

Caveat before this gets quoted: the 5,589 who published without generating may include orders
that predate the generator. This is not a clean experiment.

### Feature adoption — what a site question can sensibly be about

Top: `used_site_builder` 46.2%, `used_site_app` 45.7%, `used_image_upload` 23.6%,
`used_image` 21.7%, `used_site_published` 20.5%, `used_site_generated` 16.7%.

Bottom, and these are the ones to **not** spend a question on: `used_order_form` **3.5%**,
`used_seo_setup` **1.6%**, `used_connect_domain` **0.4%**.

More than half of all orders never open the builder at all.

### `sellsOnline → Plus` survives, but it over-serves

| plan | n | order form | published | retained |
|---|---|---|---|---|
| basic | 322 | 15.8% | 81.7% | 41.0% |
| growth | 122 | 25.4% | 78.7% | 45.1% |
| plus | 279 | **31.2%** | 82.4% | 63.4% |

Order-form use rises with tier, so the **direction** of `chooseSitePlan` is supported. But even
on Plus only ~31% ever build one, and across all orders it is 3.5%. Sending every "yes, I take
payments" answer to Plus over-serves roughly two thirds of them.

Also worth noting: **`growth` exists in `plans.json` but `chooseSitePlan` can never return it.**
There is a middle tier the recommender cannot reach.

### Domain ownership is a real signal

`domain_ownership_verified` true → **67.3%** retained (n=11,452) vs **51.1%** false (n=33,129),
a +16pt gap. But raw offering barely separates: custom domain 54.2% vs co.site 56.0% — which is
a *third* reading of the co.site question, and it lands closer to "no meaningful difference"
than either earlier source. See the open contradiction below.

### The free-text industry field, one product-generation later, is worse

| | This sheet | `Sheet13` (2023-24) |
|---|---|---|
| distinct values | **8,016** | 5,318 |
| rows | 17,527 | 13,833 |
| distinct share | **45.7%** | 38.4% |
| appearing exactly once | **82.9%** | 77.8% |

Same failure, larger. And the same sheet carries `industry` (17 values) and `sub_industry`
(104) — **Titan has already mapped this data to a clean taxonomy**; Neo's own field is still
collecting free text next to it. That is the strongest single-sheet version of our argument:
the fix exists inside the same table as the problem.

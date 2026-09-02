# Data findings

What we have actually computed, from which file, with denominators. Written 2026-09-02.

This corrects and extends the unverified claims in `docs/handoff.md` §4 and
`docs/demo-script.md`. Where a number here disagrees with one of those, **this file is
the one that was computed from source** — but read the caveats, because two of the three
sources turn out not to be representative.

Scripts: `analysis/scripts/persona_stats.py`, `analysis/scripts/athena_retention.py`.
Machine-readable output: `analysis/output/findings.json`, `analysis/output/athena_findings.json`.
Raw exploration log for the V2 dashboard: `analysis/output/titan-persona-notes.md`.

## Sources

| Source | Unit | Size | Notes |
|---|---|---|---|
| `Neo_vs_Non-neo_clients.xlsx`, `Sheet13` | order | 13,968 rows | persona fields; 2023-03-15 → 2024-02-21 |
| `Titan Persona Analysis - V2` (CSV + 8pp PDF) | domain | 5,661 / 1.3M | dashboard export; **filters change between pages** |
| `persona data with athena.xlsx`, `athena_data` | account | 153,673 | retention + segments; joins to persona on domain |

All three live in the gitignored `analysis/data/`. None are committed.

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

## 8. Field coverage — the "most predictive, least populated" line needs restating

Against `Sheet13`'s 13,968 rows:

| Field | Filled | Share |
|---|---|---|
| `employee_count` | 13,843 | **99.1%** |
| `signup_reason` | 8,104 | 58.0% |
| `import_emails_contacts` | 2,667 | **19.1%** |
| `current_email_app` | 2,669 | **19.1%** |

**The brief claims ~13% (2,484 of 18,399). Against `Sheet13` it is 19.1% (2,667 of
13,968) — a different denominator.** Don't say "13%" without saying which base.

And a live tension: **the app leads with the import question**
(`src/lib/questions.ts:70`) because one line in a handoff doc called it the strongest
signal — but import intent is the *worst-covered* field in Neo's data. Whether that is
users skipping it or Neo only asking it conditionally cannot be told from this sheet.
Worth chasing before the flow keeps leading on it.

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

- Retention cuts from the brief's §4 table that this doesn't cover: import-intent
  retention (~82%, n=102 — thin), "never logged in" 21%, source-client cuts
  (Outlook/Gmail/iPhone Mail 77–84%). These need `Retention-Raw`, not the Athena export.
- The dashboard's per-industry revenue (p4), mail volume (p5), NPS (p6) and feature
  adoption (p8) are extracted only as ranges, not per-industry values.
- **Worth requesting:** a Neo-filtered Athena export with `last_paywall_clicked_free` /
  `last_paywall_clicked_pro` at row level. The paywall fields only exist as dashboard
  aggregates today, and they are the strongest basis we have for ordering quiz questions.

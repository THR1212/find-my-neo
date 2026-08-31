# analysis/

Offline data work. **Nothing in here runs at demo time or can break the app.**

Python lives only in this folder; the app is TypeScript and never imports from here. The one
thing that crosses the boundary is `output/findings.json`, which is small, committed, and read
by the deck (and optionally the app).

---

## Setup

```bash
cd analysis
python -m venv .venv
.venv\Scripts\activate          # Windows
pip install -r requirements.txt
```

Put source spreadsheets in `analysis/data/`. **That folder is gitignored** — see below.

## Rules

**1. Never commit raw data.** `analysis/data/` is gitignored. `Neo_vs_Non-neo_clients.xlsx` and
anything like it contains real customer records — order ids, email behaviour, cancellation
reasons. It does not belong in a repo, private or not.

**2. Commit the script and the findings, not the intermediates.** A reviewer should be able to
read `scripts/*.py`, see exactly how a number was produced, and re-run it if they have the file.

**3. Every number in `findings.json` needs `n` and a date range.** A percentage without a
denominator is not usable in a pitch, and someone will ask.

**4. Dedupe on `order_id`.** `Retention-Raw` has 33,024 rows but ~18,399 unique orders. Anything
computed without deduping is wrong and will look wrong to the people who own the data.

---

## What would actually help, in priority order

### 1. Verify the 5,318 figure — highest value

The whole narrowing counter in the app opens at **5,318**, described as the number of distinct
`business_industry` strings across 13,968 rows. **We have never computed this ourselves** — it
came from an exploratory chat. It is on screen, and it is in the pitch.

Confirm or correct it. Also worth having:
- distinct count for `role_in_business` (claimed 2,327)
- the top ~20 values by frequency, and the long tail
- how many differ only by case or whitespace
- a handful of genuinely absurd examples ("Pizza", "purchase", "repair" are the claimed ones)

If the real number is different, we change the counter — that's a one-line fix and much better
than being corrected in the meeting.

### 2. Retention cuts, with denominators

Claimed in `docs/handoff.md` §4 and quoted in the demo script. All from a 2023–24 window, so
they are directional only — but we should know which survive a proper dedupe:

| Claim | Needs |
|---|---|
| Baseline 36% retained / 64% cancelled (6,664 vs 11,735 of 18,399) | recompute |
| Imported mail + contacts ~82% (n=102) | thin — confirm n |
| Imported emails only ~74% | recompute |
| Came from Outlook / Gmail / iPhone Mail 77–84% | recompute |
| Never logged in 21% | recompute |
| co.site 43% vs custom domain 29.5% | this one contradicts the strategy doc — worth being sure |
| Two-yearly 73% vs monthly 31% | this justifies our yearly-billing default in `rules.ts` |

The last row matters most for the product: `src/lib/rules.ts` defaults to yearly billing
*because* of that retention gap. If it doesn't hold, that default is wrong.

### 3. Field coverage

Claimed: `import_emails_contacts` and `current_email_app` are filled on only 2,484 of 18,399
orders (~13%) — and they are the most predictive fields. That "most predictive, least populated"
line is one of the strongest things in the pitch. Confirm it.

### 4. Competitor comparison — if the data exists

Not sourced yet. If there is a dataset comparing Neo against competitors, useful cuts would be:
where Neo wins or loses on plan shape, and whether the onboarding questions differ. Ask before
assuming this exists.

---

## Output contract

Write `analysis/output/findings.json`. Keep it flat and boring:

```json
{
  "_source": "Neo_vs_Non-neo_clients.xlsx, sheet Retention-Raw, deduped on order_id",
  "_dateRange": "2023-03-15 to 2024-02-21",
  "_computedOn": "2026-09-01",
  "_computedBy": "analysis/scripts/persona_stats.py",
  "distinctIndustryValues": { "value": 5318, "n": 13968 },
  "retentionBaseline": { "retained": 6664, "cancelled": 11735, "n": 18399 }
}
```

Anything without `n` and a source doesn't go in.

**If a number differs from what's claimed, say so in the PR rather than quietly changing it.**
Several of these are already in the demo script and in the app.

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

## 5. And then — what would YOU add?

**The list above is what we knew to ask for. It is almost certainly not the best of what's in
that spreadsheet.** You know this data and this business far better than we do, so please treat
those four as a floor, not a scope.

Some directions that might be worth more than anything above, but we can't judge from outside:

- **Anything in `Neo_vs_Non-neo_clients.xlsx` we haven't touched.** We've only looked at
  `Retention-Raw`, `Sheet13` and `Persona responses`. `Import (Persona)`, `Import (gmail)`,
  `Query` and `definition` are unexplored. If there's something better in there, take it.
- **Segments we're designing for blind.** The product assumes 1–3 person businesses and
  deliberately has no 50–200 branch. Is that the right cut? Where does retention actually break
  by headcount?
- **Which persona answers predict anything at all.** We lead the flow with import intent because
  one line in a handoff doc said it was the strongest signal. If a different field predicts
  better, that should change the question order in `src/lib/questions.ts` — that's a real
  product change, not a slide.
- **Where people drop out.** If there's funnel or chat-volume data (the 3,772 domain-selection
  chats, 273 on Neo pricing), the shape of *where* people get stuck would tell us whether our
  overlay is even in the right place.
- **Anything that contradicts us.** Genuinely useful. The co.site-vs-custom-domain retention gap
  already contradicts the 2026 strategy doc's assumption, and that's the sort of thing worth
  knowing before someone says it in a meeting.
- **Any other data you have access to.** Athena, Metabase, support tickets, Amplitude — if
  there's a cut that would make this argument stronger or kill it faster, that's more valuable
  than confirming a number we already quote.

**A finding that kills an assumption is worth more to us than one that confirms it.** Several
claims in `docs/handoff.md` and `docs/demo-script.md` are unverified and some are from a 2023–24
product state. If the data says we're wrong, we would much rather hear it now than be corrected
in front of the Neo product team.

No need to ask permission before exploring something not on the list — just note in the PR what
you looked at and why it did or didn't go anywhere. A short "checked X, nothing there" saves the
next person repeating it.

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

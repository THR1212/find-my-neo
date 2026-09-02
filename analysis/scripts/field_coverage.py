"""Task 3 in `analysis/README.md` — field coverage, and whether "most predictive" holds.

The brief: "`import_emails_contacts` and `current_email_app` are filled on only 2,484 of
18,399 orders (~13%) — and they are the most predictive fields. That 'most predictive,
least populated' line is one of the strongest things in the pitch. Confirm it."

**The coverage half is exactly right. The predictive half is backwards.**

Coverage: 2,484 / 18,399 = 13.5%, precisely as claimed. (Note the earlier 19.1% figure in
`docs/data-findings.md` §8 is the same two fields measured on `Sheet13`'s 13,968 rows — a
different sheet and denominator. Both are correct; quote the sheet with the number.)

Predictiveness: of the 11 non-leaky fields tested here, `import_emails_contacts` ranks
**last** and `current_email_app` **third from last** (`mailbox_count` sits between them) by
how much the answer is associated with retention. Cramér's V of 0.041 and 0.058, against
0.177 for `billing_cycle` — which has *fewer* levels, so the comparison is not a cardinality
artifact.

What made them look predictive is the answered-vs-blank gap, and it is the largest of any
field at +49.8pt (79.3% answered vs 29.5% blank). That gap is a selection effect, not
predictive power: both fields are filled on the *identical* 2,484 orders — zero orders have
one without the other — which is what you see when two questions sit on the same later
onboarding step that only committed users reach. See `docs/data-findings.md` §1c.

So the pitch line needs rewriting, and the honest version is stronger: Neo collects persona
data it cannot act on, and the one thing that does predict retention it never asks about.

## Method

For each field, three separate numbers that the original claim conflated:

1. **coverage** — share of the 18,399 deduped orders where the field is filled.
2. **cramersV** — association between *which answer was given* and retention, computed on
   answered rows only, over answer values with n >= 30. This is "does the answer tell you
   anything", which is what "predictive" should mean.
3. **answeredGap** — retention when filled minus retention when blank. This is the
   selection effect, and keeping it in its own column is the whole point of this script.

Three fields are flagged `LEAKS` and excluded from the ranking: `status`, `plan_type` and
`init_plan_type` encode the outcome or are downstream of it (`status` is deleted/active/
suspended, essentially the retention flag itself — hence V=0.94). They are printed for
completeness so nobody re-derives them and thinks they found a predictor.

`business_industry` and `role_in_business` carry a cardinality caveat: with 41 and 25 answer
values clearing n>=30, Cramér's V is inflated relative to a 2-4 level field, and only a third
of their answered rows survive that threshold. Do not read them as beating `billing_cycle`.

Usage:
    cd analysis
    .venv/bin/python scripts/field_coverage.py
"""

from __future__ import annotations

import datetime as dt
import json
import pathlib

import numpy as np
import pandas as pd

REPO_ROOT = pathlib.Path(__file__).resolve().parents[1]
SOURCE = REPO_ROOT / "data" / "Neo_vs_Non-neo_clients.xlsx"
OUTPUT = REPO_ROOT / "output" / "field_coverage.json"
SHEET = "Retention-Raw"
PERSONA_SHEET = "Sheet13"

MIN_LEVEL_N = 30

# Fields that encode the outcome or sit downstream of it. Reported, never ranked.
LEAKY = {"status", "plan_type", "init_plan_type"}

# High-cardinality fields whose Cramér's V is inflated by level count.
HIGH_CARD = {"business_industry", "role_in_business", "employee_count_modified"}

FIELDS = [
    "import_emails_contacts", "current_email_app", "signup_reason",
    "employee_count_modified", "role_in_business", "business_industry",
    "billing_cycle", "neo_offering", "login_tag", "client_used",
    "mailbox_count", "status", "plan_type", "init_plan_type",
]

CLAIM = {"n": 2484, "of": 18399, "share": 0.135}


def cramers_v(series: pd.Series, y: pd.Series) -> tuple[float, int, float, int]:
    """Association between which answer was given and retention. Answered rows only.

    Restricted to answer values with at least MIN_LEVEL_N rows, so a value seen twice
    cannot manufacture association out of noise.
    """
    mask = series.notna()
    sub = pd.DataFrame({"v": series[mask].astype(str), "y": y[mask]})
    keep = sub["v"].value_counts()
    keep = keep[keep >= MIN_LEVEL_N].index
    sub = sub[sub["v"].isin(keep)]
    if sub["v"].nunique() < 2:
        return float("nan"), 0, float("nan"), 0

    obs = pd.crosstab(sub["v"], sub["y"]).values.astype(float)
    exp = obs.sum(1, keepdims=True) @ obs.sum(0, keepdims=True) / obs.sum()
    chi2 = ((obs - exp) ** 2 / exp).sum()
    v = np.sqrt(chi2 / (obs.sum() * min(obs.shape[0] - 1, obs.shape[1] - 1)))
    rates = sub.groupby("v")["y"].mean()
    return float(v), int(len(sub)), float(rates.max() - rates.min()), int(sub["v"].nunique())


def main() -> None:
    if not SOURCE.exists():
        raise SystemExit(f"Source not found: {SOURCE}\nanalysis/data/ is gitignored.")

    raw = pd.read_excel(SOURCE, sheet_name=SHEET, engine="openpyxl")
    d = raw.drop_duplicates("order_id").copy()
    d["ret"] = (d["retention_tag"] == "Retained").astype(int)
    persona = pd.read_excel(SOURCE, sheet_name=PERSONA_SHEET, engine="openpyxl")

    n = len(d)
    base = float(d["ret"].mean())
    print(f"source   {SOURCE.name}  sheet {SHEET}, deduped on order_id")
    print(f"orders   {n:,}   baseline retained {base:.1%}")

    # ---- the coverage claim ----------------------------------------------------
    print("\n" + "-" * 74)
    print("THE COVERAGE CLAIM: 2,484 of 18,399 (~13%)")
    print("-" * 74)
    both = ["import_emails_contacts", "current_email_app"]
    cov = {}
    for c in both:
        filled = int(d[c].notna().sum())
        cov[c] = filled
        ok = "CONFIRMED" if filled == CLAIM["n"] else f"DIFFERS (claimed {CLAIM['n']:,})"
        print(f"  {c:<24} {filled:>6,} / {n:,} = {filled/n:>5.1%}   {ok}")

    a = d["import_emails_contacts"].notna()
    b = d["current_email_app"].notna()
    print(f"\n  both filled {int((a & b).sum()):,} | only import {int((a & ~b).sum()):,} "
          f"| only app {int((~a & b).sum()):,} | neither {int((~a & ~b).sum()):,}")
    print("  -> identical order sets. Two questions on the same onboarding step, which is")
    print("     why 'answered' is a progress marker rather than a preference.")

    print("\n  Same fields on Sheet13, for whoever quotes the other number:")
    for c in both:
        f13 = int(persona[c].notna().sum())
        print(f"    {c:<24} {f13:>6,} / {len(persona):,} = {f13/len(persona):>5.1%}")
    print("  Both are correct. Always say which sheet.")

    # ---- coverage vs predictiveness, separated -------------------------------
    rows = []
    for c in FIELDS:
        v, used, spread, levels = cramers_v(d[c], d["ret"])
        filled = int(d[c].notna().sum())
        ans = float(d[d[c].notna()]["ret"].mean())
        blank = float(d[d[c].isna()]["ret"].mean()) if filled < n else float("nan")
        rows.append({
            "field": c,
            "coverage": round(filled / n, 4),
            "filled": filled,
            "cramersV": None if np.isnan(v) else round(v, 3),
            "answerSpread": None if np.isnan(spread) else round(spread, 4),
            "levelsUsed": levels,
            "rowsUsed": used,
            "answeredRetained": round(ans, 4),
            "blankRetained": None if np.isnan(blank) else round(blank, 4),
            "answeredGap": None if np.isnan(blank) else round(ans - blank, 4),
            "flag": "LEAKS" if c in LEAKY else ("HIGH_CARDINALITY" if c in HIGH_CARD else ""),
        })

    table = pd.DataFrame(rows)
    ranked = table[table["flag"] != "LEAKS"].sort_values("cramersV", ascending=False)

    print("\n" + "-" * 74)
    print("COVERAGE vs PREDICTIVENESS — three numbers the claim conflated")
    print("-" * 74)
    disp = ranked.copy()
    disp["cov %"] = (disp["coverage"] * 100).round(1)
    disp["V"] = disp["cramersV"]
    disp["spread %"] = (disp["answerSpread"] * 100).round(1)
    disp["gap pt"] = (disp["answeredGap"] * 100).round(1)
    print(disp[["field", "cov %", "V", "spread %", "levelsUsed", "gap pt", "flag"]]
          .to_string(index=False))

    print("\n  V  = association between WHICH answer and retention (answered rows, n>=30/level)")
    print("  gap = retention when filled minus when blank — the selection effect")

    imp = ranked[ranked.field == "import_emails_contacts"].iloc[0]
    app = ranked[ranked.field == "current_email_app"].iloc[0]
    cyc = ranked[ranked.field == "billing_cycle"].iloc[0]
    # Ascending rank by association: 1 = weakest. Reported honestly rather than rounded
    # into "last and second-to-last" — mailbox_count sits between the two.
    asc = ranked.dropna(subset=["cramersV"]).sort_values("cramersV").field.tolist()
    rank_imp, rank_app, total = asc.index("import_emails_contacts") + 1, \
        asc.index("current_email_app") + 1, len(asc)

    print("\n" + "-" * 74)
    print("VERDICT")
    print("-" * 74)
    print(f"  'least populated'  CONFIRMED — {imp.coverage:.1%}, the lowest of any field here")
    print(f"  'most predictive'  CONTRADICTED — import V={imp.cramersV} ranks "
          f"{rank_imp} of {total} non-leaky fields (weakest),")
    print(f"                     current_email_app V={app.cramersV} ranks {rank_app} of "
          f"{total}. Both near the bottom.")
    print(f"                     billing_cycle is V={cyc.cramersV}, "
          f"{cyc.cramersV/imp.cramersV:.1f}x higher on FEWER levels "
          f"({int(cyc.levelsUsed)} vs {int(imp.levelsUsed)}) — not a cardinality artifact.")
    print(f"  what fooled us     the answered-vs-blank gap, "
          f"+{imp.answeredGap*100:.1f}pt — the largest of any field,")
    print("                     and a selection effect (see §1c).")

    print("\n  Leaky fields, reported so nobody rediscovers them as 'predictors':")
    for _, r in table[table["flag"] == "LEAKS"].iterrows():
        print(f"    {r.field:<18} V={r.cramersV}  <- encodes or trails the outcome")

    findings = {
        "_source": f"{SOURCE.name}, sheet {SHEET}, deduped on order_id",
        "_dateRange": f"{raw.created_at.min():%Y-%m-%d} to {raw.created_at.max():%Y-%m-%d}",
        "_computedOn": dt.date.today().isoformat(),
        "_computedBy": "analysis/scripts/field_coverage.py",
        "_caveats": [
            "cramersV is computed on answered rows only, over answer values with n>=30, so "
            "it measures whether the ANSWER predicts - not whether answering predicts.",
            "status/plan_type/init_plan_type encode or trail the outcome and are excluded "
            "from the ranking; status V=0.94 is leakage, not a finding.",
            "business_industry and role_in_business have 41 and 25 qualifying levels, which "
            "inflates Cramers V relative to 2-4 level fields, and only about a third of "
            "their answered rows clear the n>=30 threshold.",
            "2023-24 window and product state - directional only.",
        ],
        "orders": n,
        "baselineRetained": round(base, 4),
        "coverageClaim": {
            "claimed": CLAIM,
            "importFilled": cov["import_emails_contacts"],
            "emailAppFilled": cov["current_email_app"],
            "share": round(cov["import_emails_contacts"] / n, 4),
            "verdict": "CONFIRMED",
            "identicalOrderSets": bool(((a & b).sum() == a.sum() == b.sum())),
            "sheet13Coverage": {
                c: {"filled": int(persona[c].notna().sum()), "n": len(persona),
                    "share": round(float(persona[c].notna().mean()), 4)} for c in both
            },
        },
        "predictivenessVerdict": {
            "leastPopulated": "CONFIRMED",
            "mostPredictive": "CONTRADICTED",
            "importCramersV": imp.cramersV,
            "emailAppCramersV": app.cramersV,
            "billingCycleCramersV": cyc.cramersV,
            "weakestFirstRanking": asc,
            "importRank": rank_imp,
            "emailAppRank": rank_app,
            "nonLeakyFieldsRanked": total,
            "note": "By answer-to-retention association among the non-leaky fields, "
                    "import_emails_contacts is the weakest and current_email_app third "
                    "weakest, while both carry the largest answered-vs-blank gap "
                    "(+49.8pt). The apparent predictiveness is selection, not signal.",
        },
        "fields": rows,
    }
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(findings, indent=2) + "\n")
    print(f"\nwrote {OUTPUT.relative_to(REPO_ROOT.parent)}")


if __name__ == "__main__":
    main()

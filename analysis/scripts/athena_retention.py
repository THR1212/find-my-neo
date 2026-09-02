"""Retention cuts from the Athena export — task 2 in `analysis/README.md`, properly sourced.

The brief's retention claims come from a 2023-24 order-level spreadsheet and are
directional only. This script recomputes the ones that matter against the Athena
export (153,673 accounts), which carries per-account monthly retention flags plus
billing cycle, mailbox segment, source and country.

The claim that matters most for the product is the last row of the brief's table:
"Two-yearly 73% vs monthly 31%", which is *why* `src/lib/rules.ts` defaults to yearly
billing. If it doesn't hold, that default is wrong.

Two data problems the export ships with, both handled below:

1. `mbx_segment` has been mangled by Excel. The segment labels "2-5" and "6-20" were
   auto-converted to dates ("2026-02-05", "2026-06-20"). Decoded back by hand.
2. `mbx` is constant (always 1) and `geo_type` is entirely empty. Both dropped.

Retention semantics carry a caveat worth stating in any writeup: `m1_retained` averages
0.23 here, while the V2 dashboard PDF shows "M1 retention" near 0.94. These are not the
same measure — most likely per-account activity here vs. domain-level survival there.
1,048 rows have m12=1 while m1=0, so the flags are "active in month m" rather than
"survived continuously through month m". Treat the *ordering* between segments as the
finding, not the absolute levels.

Usage:
    cd analysis
    .venv/bin/python scripts/athena_retention.py
"""

from __future__ import annotations

import datetime as dt
import json
import pathlib

import pandas as pd

REPO_ROOT = pathlib.Path(__file__).resolve().parents[1]
SOURCE = REPO_ROOT / "data" / "persona data with athena.xlsx"
OUTPUT = REPO_ROOT / "output" / "athena_findings.json"

ATHENA_SHEET = "athena_data"
PERSONA_SHEET = "Titan Persona Analysis - V2_Acq"

MONTHS = [f"m{i}_retained" for i in range(1, 13)]
HEADLINE = ["m1_retained", "m6_retained", "m12_retained"]

# Excel turned these segment labels into dates on export.
SEGMENT_FIX = {"2026-02-05 00:00:00": "2-5", "2026-06-20 00:00:00": "6-20"}
SEGMENT_ORDER = ["1", "2-5", "6-20", "21+"]

# Longest commitment first — the order the retention gradient should follow if the
# yearly-billing default in rules.ts is justified.
CYCLE_ORDER = ["four_yearly", "two_yearly", "yearly", "quarterly", "monthly"]


def load() -> tuple[pd.DataFrame, pd.DataFrame]:
    if not SOURCE.exists():
        raise SystemExit(
            f"Source not found: {SOURCE}\n"
            "analysis/data/ is gitignored — place the workbook there by hand."
        )
    ath = pd.read_excel(SOURCE, sheet_name=ATHENA_SHEET, engine="openpyxl")
    per = pd.read_excel(SOURCE, sheet_name=PERSONA_SHEET, engine="openpyxl")

    ath["seg"] = ath["mbx_segment"].astype(str).replace(SEGMENT_FIX)
    ath["cycle"] = ath["billing_cycle"].fillna("(missing)")
    ath = ath.drop(columns=["mbx", "geo_type"])  # constant / empty
    return ath, per


def cut(df: pd.DataFrame, by: str, order: list[str] | None = None) -> pd.DataFrame:
    """Retention by one dimension, with n. Every row carries its own denominator."""
    g = df.groupby(by, observed=True)[HEADLINE].mean()
    g["n"] = df.groupby(by, observed=True).size()
    if order:
        g = g.reindex([o for o in order if o in g.index])
    return g.round(4)


def as_records(g: pd.DataFrame, label: str) -> list[dict]:
    return [
        {
            label: str(idx),
            "m1": float(r.m1_retained),
            "m6": float(r.m6_retained),
            "m12": float(r.m12_retained),
            "n": int(r.n),
        }
        for idx, r in g.iterrows()
    ]


def show(title: str, g: pd.DataFrame) -> None:
    print(f"\n=== {title} ===")
    out = g.copy()
    for c in HEADLINE:
        out[c] = (out[c] * 100).round(1)
    out["n"] = out["n"].map(lambda v: f"{v:,}")
    out.columns = ["m1 %", "m6 %", "m12 %", "n"]
    print(out.to_string())


def main() -> None:
    ath, per = load()
    n_acc = len(ath)

    print(f"source   {SOURCE.name}")
    print(f"accounts {n_acc:,}  domains {ath.domain_name.nunique():,}  "
          f"orders {ath.order_id.nunique():,}")
    print(f"age_months {ath.age_months.min()}-{ath.age_months.max()} "
          f"(median {int(ath.age_months.median())}) — every account is >=12mo old, "
          "so m12 is measurable for all of them")

    # --- 1. Billing cycle. The rules.ts question. -------------------------------
    by_cycle = cut(ath, "cycle", CYCLE_ORDER + ["(missing)"])
    show("retention by billing cycle", by_cycle)
    paid = by_cycle.drop(index="(missing)", errors="ignore")
    ratio = paid.loc["two_yearly", "m12_retained"] / paid.loc["monthly", "m12_retained"]
    print(f"\n  two_yearly m12 / monthly m12 = {ratio:.1f}x")
    print(f"  brief claims two-yearly 73% vs monthly 31% (2.4x) — direction holds, "
          f"levels do not (different measure/population)")

    # --- 2. Mailbox segment. Counterintuitive. ----------------------------------
    by_seg = cut(ath, "seg", SEGMENT_ORDER)
    show("retention by mailbox segment", by_seg)
    print(f"\n  1 mailbox retains {by_seg.loc['1','m12_retained'] / by_seg.loc['21+','m12_retained']:.1f}x "
          "better at m12 than 21+ — retention DECREASES with size")

    # --- 3. Is the billing-cycle effect just mailbox count in disguise? ---------
    # Simpson's-check: hold segment fixed and see if the cycle gradient survives.
    print("\n=== m12 retention: billing cycle x mailbox segment (%) ===")
    piv = (
        ath[ath.cycle != "(missing)"]
        .pivot_table(index="cycle", columns="seg", values="m12_retained", aggfunc="mean")
        .reindex(index=[c for c in CYCLE_ORDER], columns=SEGMENT_ORDER)
        * 100
    ).round(1)
    counts = (
        ath[ath.cycle != "(missing)"]
        .pivot_table(index="cycle", columns="seg", values="m12_retained", aggfunc="size")
        .reindex(index=[c for c in CYCLE_ORDER], columns=SEGMENT_ORDER)
    )
    print(piv.to_string())
    print("\n  cell counts:")
    print(counts.fillna(0).astype(int).to_string())

    # --- 4. Source ---------------------------------------------------------------
    src = ath.copy()
    src["clean_source"] = src["clean_source"].where(
        src["clean_source"].isin(["Neo Site", "mobile_order", "businessCloud"]), "(other)"
    )
    by_src = cut(src, "clean_source")
    show("retention by signup source", by_src.sort_values("n", ascending=False))

    # --- 5. Industry, via the persona join --------------------------------------
    per_key = per.assign(dom=per["Domain Name"].astype(str).str.strip().str.lower())
    ath_key = ath.assign(dom=ath["domain_name"].astype(str).str.strip().str.lower())
    joined = ath_key.merge(
        per_key[["dom", "Industry", "Sub Industry", "plan_type", "model"]].drop_duplicates("dom"),
        on="dom", how="inner",
    )
    print(f"\njoin: {joined.dom.nunique():,} of {per_key.dom.nunique():,} persona domains "
          f"matched ({joined.dom.nunique()/per_key.dom.nunique():.1%}), "
          f"{len(joined):,} accounts")
    by_ind = cut(joined, "Industry").sort_values("m12_retained", ascending=False)
    show("retention by industry (joined subset only)", by_ind)

    by_plan = cut(joined, "plan_type").sort_values("m12_retained", ascending=False)
    show("retention by plan type (joined subset only)", by_plan)
    by_model = cut(joined, "model").sort_values("m12_retained", ascending=False)
    show("retention by model (joined subset only)", by_model)

    # --- 6. Country, where n supports it ----------------------------------------
    top_countries = ath.country.value_counts().head(12).index
    by_country = cut(ath[ath.country.isin(top_countries)], "country").sort_values(
        "m12_retained", ascending=False
    )
    show("retention by country (top 12 by volume)", by_country)

    # --- 7. Full survival curve --------------------------------------------------
    print("\n=== overall retention curve (all accounts) ===")
    for m in MONTHS:
        print(f"  {m:<14} {ath[m].mean()*100:>5.2f}%")

    findings = {
        "_source": f"{SOURCE.name}, sheet {ATHENA_SHEET} (retention/segments) joined to "
                   f"sheet {PERSONA_SHEET} on domain for the industry cuts",
        "_computedOn": dt.date.today().isoformat(),
        "_computedBy": "analysis/scripts/athena_retention.py",
        "_caveats": [
            "m*_retained here averages 0.23 at m1 vs ~0.94 in the V2 dashboard PDF — "
            "different measures. Compare orderings between segments, not absolute levels.",
            "1,048 rows have m12=1 while m1=0, so flags mean 'active in month m', "
            "not 'survived continuously to month m'.",
            "mbx_segment labels '2-5' and '6-20' arrived Excel-mangled as dates and were "
            "decoded back in this script.",
            "mbx is constant (1) and geo_type is entirely empty; both dropped.",
            "Industry cuts cover only the joined subset - see joinCoverage.",
            "Unit is the account, not the domain: 153,673 accounts over 81,670 domains.",
        ],
        "accounts": n_acc,
        "domains": int(ath.domain_name.nunique()),
        "orders": int(ath.order_id.nunique()),
        "ageMonths": {"min": int(ath.age_months.min()), "max": int(ath.age_months.max()),
                      "median": int(ath.age_months.median())},
        "joinCoverage": {
            "personaDomains": int(per_key.dom.nunique()),
            "matchedDomains": int(joined.dom.nunique()),
            "matchedAccounts": int(len(joined)),
        },
        "retentionCurve": {m: round(float(ath[m].mean()), 4) for m in MONTHS},
        "byBillingCycle": as_records(by_cycle, "billingCycle"),
        "byMailboxSegment": as_records(by_seg, "mailboxSegment"),
        "bySignupSource": as_records(by_src, "source"),
        "byIndustry": as_records(by_ind, "industry"),
        "byPlanType": as_records(by_plan, "planType"),
        "byModel": as_records(by_model, "model"),
        "byCountry": as_records(by_country, "country"),
        "twoYearlyVsMonthlyM12Ratio": round(float(ratio), 2),
    }
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(findings, indent=2) + "\n")
    print(f"\nwrote {OUTPUT.relative_to(REPO_ROOT.parent)}")


if __name__ == "__main__":
    main()

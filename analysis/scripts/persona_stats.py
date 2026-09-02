"""Verify the 5,318 figure the app opens on, and the persona-field claims around it.

Task 1 in `analysis/README.md`. The narrowing meter in the app starts at
`STARTING_SETUPS = 5318` (`src/lib/engine.ts`) and the number is quoted in
`docs/demo-script.md`, `docs/handoff.md` and `DECISIONS.md`. It came from an
exploratory chat and had never been recomputed from the source file — this script
is that recomputation, so a reviewer can see exactly how each number was produced.

The persona fields live in `Sheet13`, not `Persona responses`. `Persona responses`
is a pivot summary with merged header rows and no per-order records; `Sheet13` is
the flat 13,968-row export that carries `business_industry` and `role_in_business`.

`Sheet13` has no date column, so the date range is recovered by joining `order_id`
against `Retention-Raw`, which is also the sheet the retention claims come from.

Usage:
    cd analysis
    .venv/bin/python scripts/persona_stats.py
"""

from __future__ import annotations

import datetime as dt
import json
import pathlib
import re

import pandas as pd

REPO_ROOT = pathlib.Path(__file__).resolve().parents[1]
SOURCE = REPO_ROOT / "data" / "Neo_vs_Non-neo_clients.xlsx"
OUTPUT = REPO_ROOT / "output" / "findings.json"

PERSONA_SHEET = "Sheet13"
RETENTION_SHEET = "Retention-Raw"

# The values docs/handoff.md holds up as evidence that Neo cannot act on this field.
# Checked verbatim so the demo script does not quote an example that isn't in the data.
CLAIMED_ABSURD = ["Pizza", "ONLINE STORE", "Consort", "repair", "purchase"]

# What the app and the docs currently assert, so the script reports agreement or drift
# rather than leaving the reader to compare by eye.
CLAIMS = {
    "rows": 13968,
    "distinctIndustryValues": 5318,
    "distinctRoleValues": 2327,
}


def normalise(series: pd.Series) -> pd.Series:
    """Casefold and collapse whitespace — the comparison Neo's field does not do.

    Distinct-value counts on the raw strings treat "Pizza", "pizza" and " Pizza "
    as three industries. Counting again after this normalisation shows how much of
    the 5,318 is genuine variety and how much is the same answer typed differently.
    """
    return (
        series.dropna()
        .astype(str)
        .str.strip()
        .str.replace(r"\s+", " ", regex=True)
        .str.casefold()
    )


def distinct_stats(series: pd.Series, label: str) -> dict:
    """Raw vs normalised distinct counts for one free-text field, plus its tail."""
    raw = series.dropna().astype(str)
    norm = normalise(series)

    counts = norm.value_counts()
    singletons = int((counts == 1).sum())

    return {
        "field": label,
        "raw": {"value": int(raw.nunique()), "n": int(len(raw))},
        "normalised": {"value": int(norm.nunique()), "n": int(len(norm))},
        # How many of the raw distinct values collapse once case and whitespace stop
        # counting as difference. This is the "data quality" half of the argument.
        "collapsedByCaseOrWhitespace": int(raw.nunique() - norm.nunique()),
        # A long tail of one-off answers is what makes the field unusable for routing:
        # you cannot build a product decision on a category with a single member.
        "valuesOccurringOnce": singletons,
        "valuesOccurringOnceShare": round(singletons / len(counts), 4),
        "top20": [
            {"value": v, "count": int(c)} for v, c in counts.head(20).items()
        ],
    }


def main() -> None:
    if not SOURCE.exists():
        raise SystemExit(
            f"Source spreadsheet not found: {SOURCE}\n"
            "analysis/data/ is gitignored — the file has to be placed there by hand."
        )

    persona = pd.read_excel(SOURCE, sheet_name=PERSONA_SHEET, engine="openpyxl")
    retention = pd.read_excel(
        SOURCE, sheet_name=RETENTION_SHEET, engine="openpyxl", usecols=["order_id", "created_at"]
    )

    rows = len(persona)

    # Rule 4 in the brief: dedupe on order_id. Sheet13 carries 513 duplicate order_id
    # rows, 521 rows that are byte-identical duplicates. Both counts are reported so the
    # reader can see the dedupe does not move the headline number materially.
    deduped = persona.dropna(subset=["order_id"]).drop_duplicates(subset=["order_id"])

    industry = distinct_stats(persona["business_industry"], "business_industry")
    role = distinct_stats(persona["role_in_business"], "role_in_business")
    industry_deduped = int(deduped["business_industry"].dropna().nunique())
    role_deduped = int(deduped["role_in_business"].dropna().nunique())

    # Date range: Sheet13 has no timestamp, so borrow it from Retention-Raw via order_id.
    dated = persona.merge(
        retention.drop_duplicates("order_id"), on="order_id", how="left"
    )
    matched = dated["created_at"].dropna()
    date_range = f"{matched.min():%Y-%m-%d} to {matched.max():%Y-%m-%d}"

    # Task 3 in the brief: the "most predictive, least populated" fields. Note the
    # denominator here is Sheet13's 13,968 persona rows, not the 18,399 deduped
    # retention orders the brief's ~13% claim is stated against — different bases.
    coverage = {
        field: {
            "filled": int(persona[field].notna().sum()),
            "n": rows,
            "share": round(float(persona[field].notna().mean()), 4),
        }
        for field in ("import_emails_contacts", "current_email_app", "signup_reason", "employee_count")
    }

    # Do the quoted examples actually appear? Matched case-insensitively on the
    # trimmed value, and reported with their frequency.
    industry_norm = normalise(persona["business_industry"])
    industry_norm_counts = industry_norm.value_counts()
    absurd = [
        {
            "claimed": example,
            "present": example.strip().casefold() in industry_norm_counts.index,
            "count": int(industry_norm_counts.get(example.strip().casefold(), 0)),
        }
        for example in CLAIMED_ABSURD
    ]

    findings = {
        "_source": f"Neo_vs_Non-neo_clients.xlsx, sheet {PERSONA_SHEET} (persona fields); "
                   f"date range joined from {RETENTION_SHEET} on order_id",
        "_dateRange": date_range,
        "_computedOn": dt.date.today().isoformat(),
        "_computedBy": "analysis/scripts/persona_stats.py",
        "_note": (
            "business_industry and role_in_business live in Sheet13, not 'Persona responses' "
            "(which is a pivot summary). Counts are over non-null values; n states the "
            "denominator used for each."
        ),

        # The headline. Confirms the number already on screen in the app.
        "distinctIndustryValues": {
            "value": industry["raw"]["value"],
            "n": industry["raw"]["n"],
            "rowsInSheet": rows,
            "claimed": CLAIMS["distinctIndustryValues"],
            "matchesClaim": industry["raw"]["value"] == CLAIMS["distinctIndustryValues"],
        },
        "distinctRoleValues": {
            "value": role["raw"]["value"],
            "n": role["raw"]["n"],
            "rowsInSheet": rows,
            "claimed": CLAIMS["distinctRoleValues"],
            "matchesClaim": role["raw"]["value"] == CLAIMS["distinctRoleValues"],
        },

        # Same counts after deduping on order_id, per rule 4.
        "distinctIndustryValuesDedupedOnOrderId": {
            "value": industry_deduped,
            "n": int(deduped["business_industry"].notna().sum()),
            "uniqueOrders": int(deduped["order_id"].nunique()),
        },
        "distinctRoleValuesDedupedOnOrderId": {
            "value": role_deduped,
            "n": int(deduped["role_in_business"].notna().sum()),
            "uniqueOrders": int(deduped["order_id"].nunique()),
        },

        "sheetShape": {
            "rows": rows,
            "claimedRows": CLAIMS["rows"],
            "matchesClaim": rows == CLAIMS["rows"],
            "nonNullOrderIds": int(persona["order_id"].notna().sum()),
            "uniqueOrderIds": int(persona["order_id"].nunique()),
            "duplicateOrderIdRows": int(
                persona["order_id"].notna().sum() - persona["order_id"].nunique()
            ),
            "fullyDuplicatedRows": int(persona.duplicated().sum()),
            "ordersMatchedToADate": int(len(matched)),
        },

        "industryFieldDetail": industry,
        "roleFieldDetail": role,
        "fieldCoverage": coverage,
        "claimedAbsurdExamples": absurd,
    }

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(findings, indent=2) + "\n")

    # Console summary — the shape a reviewer wants without opening the JSON.
    def verdict(actual: int, claimed: int) -> str:
        return "CONFIRMED" if actual == claimed else f"DIFFERS (claimed {claimed:,})"

    print(f"source        {SOURCE.name}  sheet {PERSONA_SHEET}")
    print(f"date range    {date_range}  ({len(matched):,} of {rows:,} rows dated)")
    print()
    print(f"rows                       {rows:,}   {verdict(rows, CLAIMS['rows'])}")
    print(
        f"distinct business_industry {industry['raw']['value']:,}   "
        f"{verdict(industry['raw']['value'], CLAIMS['distinctIndustryValues'])}"
        f"   (n={industry['raw']['n']:,})"
    )
    print(
        f"distinct role_in_business  {role['raw']['value']:,}   "
        f"{verdict(role['raw']['value'], CLAIMS['distinctRoleValues'])}"
        f"   (n={role['raw']['n']:,})"
    )
    print()
    print(f"after case/whitespace normalisation: {industry['normalised']['value']:,} industries "
          f"({industry['collapsedByCaseOrWhitespace']:,} were the same answer typed differently)")
    print(f"values appearing exactly once:       {industry['valuesOccurringOnce']:,} "
          f"({industry['valuesOccurringOnceShare']:.1%} of distinct values)")
    print(f"deduped on order_id:                 {industry_deduped:,} industries "
          f"across {deduped['order_id'].nunique():,} unique orders")
    print()
    print("top 10 industries:")
    for item in industry["top20"][:10]:
        print(f"  {item['count']:>6,}  {item['value']}")
    print()
    print("claimed absurd examples:")
    for item in absurd:
        mark = "yes" if item["present"] else "NOT FOUND"
        print(f"  {item['claimed']:<14} {mark:<10} n={item['count']:,}")
    print()
    print(f"wrote {OUTPUT.relative_to(REPO_ROOT.parent)}")


if __name__ == "__main__":
    main()

"""What people actually do with a Neo site — for the site questions and the site plan.

Source: `neo site order data.xlsx`, sheet `athena site data`. 44,581 orders, one row each,
with 16 usable site-feature flags, a 3-way retention status, and Titan's 17-value industry
taxonomy alongside Neo's raw free-text `business_industry`.

Two things this is for:

1. **Which site questions are worth asking.** A feature used by 1.6% of orders does not
   deserve a question on a four-question budget.
2. **Whether `chooseSitePlan` in src/lib/rules.ts is right.** That rule sends anyone who says
   they take payments to Plus, on the reasoning that selling needs an order form.

The headline is neither of those, though. It is that **generating a site barely predicts
retention and publishing one predicts it enormously** — and that matters because our whole
reveal is built around Neo's generated site.

## Caveats that gate everything below

- **Only 723 of 44,581 orders are on a paid site plan** (basic 322, plus 279, growth 122).
  Everything else is `site_beta`, `free_site` or `freeplan_site`. Plan-level numbers rest on
  those 723 and should be read as directional.
- **`freeplan_site` is a selection artifact.** 97.8% of it is published and 93.5% retained,
  which is not a plan that causes retention — it looks like a plan granted *after* publishing.
  Excluded from plan comparisons where it would mislead.
- **`used_external_links` is effectively a duplicate of `used_site_published`** — they differ
  on 2 of 44,581 rows. Treat them as one signal, never as two agreeing ones.
- **`used_dns_record` is constant 0** and is dropped.
- Retention here is a 3-way status flag (retained / churned / at_risk) on a different
  population from the other datasets. Compare orderings, not levels, against
  `docs/data-findings.md`.

Usage:
    cd analysis
    .venv/bin/python scripts/site_usage.py
"""

from __future__ import annotations

import datetime as dt
import json
import pathlib

import pandas as pd

REPO_ROOT = pathlib.Path(__file__).resolve().parents[1]
SOURCE = REPO_ROOT / "data" / "neo site order data.xlsx"
OUTPUT = REPO_ROOT / "output" / "site_usage.json"
SHEET = "athena site data"

PAID = ["basic", "plus", "growth"]
# Granted after publishing, so it cannot be read as a plan that drives publishing.
ARTIFACT_PLAN = "freeplan_site"


def pct(x: float) -> float:
    return round(float(x) * 100, 1)


def main() -> None:
    if not SOURCE.exists():
        raise SystemExit(f"Source not found: {SOURCE}\nanalysis/data/ is gitignored.")

    d = pd.read_excel(SOURCE, sheet_name=SHEET, engine="openpyxl")
    d["ret"] = (d["retention_status"] == "retained").astype(int)

    feats = [c for c in d.columns if c.startswith("used_") and d[c].nunique() > 1]
    dropped = [c for c in d.columns if c.startswith("used_") and d[c].nunique() <= 1]

    n = len(d)
    base = float(d["ret"].mean())
    print(f"source   {SOURCE.name}  sheet {SHEET}")
    print(f"orders   {n:,}  domains {d.domain_name.nunique():,}  "
          f"baseline retained {base:.1%}")
    print(f"dropped constant columns: {dropped or 'none'}")

    dup = int((d["used_site_published"] != d["used_external_links"]).sum())
    print(f"used_external_links disagrees with used_site_published on {dup} of {n:,} rows "
          "— treat as ONE signal")

    # ---- 1. what people actually use ------------------------------------------
    print("\n" + "-" * 72)
    print("FEATURE ADOPTION — what a site question could sensibly be about")
    print("-" * 72)
    adoption = d[feats].mean().sort_values(ascending=False)
    for k, v in adoption.items():
        print(f"  {k:<24} {pct(v):>5.1f}%   n={int(d[k].sum()):>6,}")

    # ---- 2. the headline: generate vs publish ----------------------------------
    print("\n" + "-" * 72)
    print("GENERATING IS NOT THE VALUE MOMENT. PUBLISHING IS.")
    print("-" * 72)
    cells = []
    for g in (0, 1):
        for p in (0, 1):
            sub = d[(d.used_site_generated == g) & (d.used_site_published == p)]
            cells.append({"generated": bool(g), "published": bool(p),
                          "n": len(sub), "retained": round(float(sub.ret.mean()), 4)})
            print(f"  generated={g}  published={p}   n={len(sub):>6,}   "
                  f"retained {sub.ret.mean():>6.1%}")
    gen_lift = float(d[d.used_site_generated == 1].ret.mean() -
                     d[d.used_site_generated == 0].ret.mean())
    pub_lift = float(d[d.used_site_published == 1].ret.mean() -
                     d[d.used_site_published == 0].ret.mean())
    print(f"\n  publishing lift  {pub_lift*100:+.1f}pt   <- the largest of any flag")
    print(f"  generating lift  {gen_lift*100:+.1f}pt   <- near nothing")
    print("  And among people who published, those who did NOT use the generator retain")
    print("  BEST. Generation looks like a tyre-kicking signal, not a commitment one.")
    print("  (Caveat: 5,589 published without generating may include pre-generator orders.)")

    # ---- 3. feature -> retention ------------------------------------------------
    print("\n" + "-" * 72)
    print(f"FEATURE -> RETENTION LIFT  (baseline {base:.1%})")
    print("-" * 72)
    lift_rows = []
    for f in feats:
        a = float(d[d[f] == 1].ret.mean())
        b = float(d[d[f] == 0].ret.mean())
        lift_rows.append({"feature": f, "usedRetained": round(a, 4),
                          "notUsedRetained": round(b, 4), "liftPt": round((a - b) * 100, 1),
                          "nUsed": int(d[f].sum()), "adoption": round(float(d[f].mean()), 4)})
    lift = pd.DataFrame(lift_rows).sort_values("liftPt", ascending=False)
    for _, r in lift.iterrows():
        print(f"  {r.feature:<24} used {pct(r.usedRetained):>5.1f}%  "
              f"vs {pct(r.notUsedRetained):>5.1f}%   {r.liftPt:>+5.1f}pt   n={r.nUsed:,}")

    # ---- 4. does sellsOnline -> Plus hold? -------------------------------------
    print("\n" + "-" * 72)
    print("DOES `sellsOnline -> Plus` HOLD? (rules.ts chooseSitePlan)")
    print("-" * 72)
    paid = d[d.plan.isin(PAID)]
    by_plan = paid.groupby("plan").agg(
        n=("order_id", "size"),
        orderForm=("used_order_form", "mean"),
        published=("used_site_published", "mean"),
        retained=("ret", "mean"),
    ).reindex(PAID)
    for planid, r in by_plan.iterrows():
        print(f"  {planid:<8} n={int(r.n):>4}   order form {pct(r.orderForm):>5.1f}%   "
              f"published {pct(r.published):>5.1f}%   retained {pct(r.retained):>5.1f}%")
    print("\n  Order-form use rises with tier (basic -> growth -> plus), so the rule's")
    print("  DIRECTION is supported. But even on Plus only ~31% ever build one, and")
    print(f"  across all {n:,} orders order forms are used by just "
          f"{pct(d.used_order_form.mean())}%. Sending every 'I take payments' answer to")
    print("  Plus over-serves most of them. `growth` exists in plans.json and")
    print("  chooseSitePlan can never return it.")

    # ---- 5. custom domain -------------------------------------------------------
    print("\n" + "-" * 72)
    print("DOMAIN OWNERSHIP")
    print("-" * 72)
    dom = d.groupby("domain_ownership_verified").agg(
        n=("order_id", "size"), retained=("ret", "mean"))
    for k, r in dom.iterrows():
        print(f"  verified={str(k):<5}  n={int(r.n):>6,}   retained {pct(r.retained):>5.1f}%")
    off = d.groupby("offering").agg(n=("order_id", "size"), retained=("ret", "mean"))
    for k, r in off.iterrows():
        print(f"  {k:<20} n={int(r.n):>6,}   retained {pct(r.retained):>5.1f}%")

    # ---- 6. the industry field, again, worse ------------------------------------
    print("\n" + "-" * 72)
    print("THE FREE-TEXT INDUSTRY FIELD — a fresh, worse instance")
    print("-" * 72)
    bi = d["business_industry"].dropna().astype(str)
    norm = bi.str.strip().str.casefold()
    counts = norm.value_counts()
    print(f"  {bi.nunique():,} distinct across {len(bi):,} rows = "
          f"{bi.nunique()/len(bi):.1%} distinct")
    print(f"  after case/whitespace normalisation: {norm.nunique():,} "
          f"({bi.nunique()-norm.nunique():,} were the same answer typed differently)")
    print(f"  appearing exactly once: {int((counts==1).sum()):,} "
          f"({(counts==1).mean():.1%} of distinct values)")
    print(f"  meanwhile `industry` in the same sheet has {d.industry.nunique()} values and "
          f"`sub_industry` {d.sub_industry.nunique()} — Titan's taxonomy, already mapped.")

    findings = {
        "_source": f"{SOURCE.name}, sheet {SHEET}",
        "_computedOn": dt.date.today().isoformat(),
        "_computedBy": "analysis/scripts/site_usage.py",
        "_caveats": [
            "Only 723 of 44,581 orders are on a paid site plan (basic 322, plus 279, "
            "growth 122); plan-level numbers are directional.",
            "freeplan_site is 97.8% published and 93.5% retained - it looks granted AFTER "
            "publishing, so it cannot be read as a plan that causes retention.",
            "used_external_links duplicates used_site_published (differ on 2 of 44,581 "
            "rows). One signal, not two.",
            "used_dns_record is constant 0 and dropped.",
            "Retention is a 3-way status flag on a different population from the other "
            "datasets - compare orderings, not levels.",
            "5,589 orders published without generating may include orders predating the "
            "generator; the generate-vs-publish comparison is not a clean experiment.",
        ],
        "orders": n,
        "domains": int(d.domain_name.nunique()),
        "baselineRetained": round(base, 4),
        "planMix": {str(k): int(v) for k, v in d.plan.value_counts().items()},
        "retentionStatusMix": {str(k): int(v) for k, v in d.retention_status.value_counts().items()},
        "featureAdoption": {k: round(float(v), 4) for k, v in adoption.items()},
        "featureRetentionLift": lift_rows,
        "generateVsPublish": {
            "cells": cells,
            "publishLiftPt": round(pub_lift * 100, 1),
            "generateLiftPt": round(gen_lift * 100, 1),
        },
        "paidPlanUsage": [
            {"plan": str(i), "n": int(r.n), "orderForm": round(float(r.orderForm), 4),
             "published": round(float(r.published), 4), "retained": round(float(r.retained), 4)}
            for i, r in by_plan.iterrows()
        ],
        "orderFormOverallAdoption": round(float(d.used_order_form.mean()), 4),
        "domainOwnership": [
            {"verified": bool(k), "n": int(r.n), "retained": round(float(r.retained), 4)}
            for k, r in dom.iterrows()
        ],
        "freeTextIndustry": {
            "distinct": int(bi.nunique()),
            "rows": int(len(bi)),
            "distinctShare": round(float(bi.nunique() / len(bi)), 4),
            "normalisedDistinct": int(norm.nunique()),
            "collapsedByCaseOrWhitespace": int(bi.nunique() - norm.nunique()),
            "appearingOnce": int((counts == 1).sum()),
            "appearingOnceShare": round(float((counts == 1).mean()), 4),
            "taxonomyIndustryValues": int(d.industry.nunique()),
            "taxonomySubIndustryValues": int(d.sub_industry.nunique()),
        },
    }
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(findings, indent=2) + "\n")
    print(f"\nwrote {OUTPUT.relative_to(REPO_ROOT.parent)}")


if __name__ == "__main__":
    main()

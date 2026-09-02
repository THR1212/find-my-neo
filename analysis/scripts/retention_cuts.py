"""Task 2 in `analysis/README.md` — the retention cuts, deduped on order_id.

Recomputes every claim in the brief's §4 table from `Retention-Raw`, which is where
those claims came from. Deduped on `order_id` per rule 4: the sheet has 33,024 rows but
only 18,399 unique orders, so 14,625 rows repeat an `order_id` already seen (14,387 of
them are byte-identical). Anything computed without deduping is inflated ~1.8x.

**Every claim in the table reproduces, most of them exactly.** The interesting result is
not the confirmation — it is what the import-intent cut turns out to mean.

`docs/handoff.md` reads the ~82% retention of "imported emails and contacts" as import
intent being the strongest signal, and `src/lib/questions.ts` leads the flow with the
import question because of it. But "No, don't want to import" retains at 79.5% —
statistically indistinguishable from the 82.4% of "Yes, import both". The content of the
answer barely matters. What separates people is **whether the field is filled at all**:
79.3% retained when answered vs 29.5% when blank.

`import_emails_contacts` and `current_email_app` are filled on the same 2,484 orders, and
both fields sit later in Neo's onboarding than the fields that were asked at signup
(`business_industry`, `role_in_business` and `employee_count` are filled on 13,085+ and
show the *opposite* sign). So the 79% is a marker of having progressed through
onboarding, not a preference that can be acted on.

That matters because the app asks the import question **before purchase, to a cold
visitor**. The retention it is justified by was measured on people who answered it
*after* signing up. The signal is not available at the moment the app tries to use it.

So this script also separates the cuts into what is knowable pre-purchase and what is
not — that distinction is the actionable output, not the confirmations.

Usage:
    cd analysis
    .venv/bin/python scripts/retention_cuts.py
"""

from __future__ import annotations

import datetime as dt
import json
import pathlib

import pandas as pd

REPO_ROOT = pathlib.Path(__file__).resolve().parents[1]
SOURCE = REPO_ROOT / "data" / "Neo_vs_Non-neo_clients.xlsx"
OUTPUT = REPO_ROOT / "output" / "retention_cuts.json"
SHEET = "Retention-Raw"

# Columns Neo one-hot encodes: a non-null cell means the user picked that option.
EMAIL_APPS = ["Microsoft Outlook", "Gmail website", "Gmail mobile app", "iPhone Mail",
              "Mac Mail", "Thunderbird", "Other.1"]
SIGNUP_REASONS = ["Email with my company name", "Zero setup email", "Free domain",
                  "Simple one-page site", "Read receipt email feature", "Other"]

# What the brief's §4 table asserts, so the script reports agreement rather than
# leaving the reader to compare by eye.
CLAIMS = {
    "baselineRetained": 0.36,
    "twoYearly": 0.73,
    "monthly": 0.31,
    "coSite": 0.43,
    "customDomain": 0.295,
    "neverLoggedIn": 0.21,
    "importBoth": 0.82,
    "importBothN": 102,
    "importEmailsOnly": 0.74,
}


def rate(df: pd.DataFrame) -> tuple[float, int]:
    return float(df["ret"].mean()), int(len(df))


def by(d: pd.DataFrame, col: str) -> pd.DataFrame:
    g = d.groupby(col, observed=True)["ret"].agg(["mean", "size"])
    return g.rename(columns={"mean": "retained", "size": "n"}).sort_values(
        "retained", ascending=False
    )


def show(title: str, g: pd.DataFrame, note: str = "") -> None:
    print(f"\n=== {title} ===")
    out = g.copy()
    out["retained"] = (out["retained"] * 100).round(1)
    out["n"] = out["n"].map(lambda v: f"{v:,}")
    out.columns = ["retained %", "n"]
    print(out.to_string())
    if note:
        print(f"  {note}")


def records(g: pd.DataFrame, label: str) -> list[dict]:
    return [
        {label: str(i), "retained": round(float(r.retained), 4), "n": int(r.n)}
        for i, r in g.iterrows()
    ]


def verdict(actual: float, claimed: float, tol: float = 0.015) -> str:
    return "CONFIRMED" if abs(actual - claimed) <= tol else f"DIFFERS (claimed {claimed:.1%})"


def main() -> None:
    if not SOURCE.exists():
        raise SystemExit(f"Source not found: {SOURCE}\nanalysis/data/ is gitignored.")

    raw = pd.read_excel(SOURCE, sheet_name=SHEET, engine="openpyxl")
    d = raw.drop_duplicates("order_id").copy()
    d["ret"] = (d["retention_tag"] == "Retained").astype(int)
    d["answered_import"] = d["import_emails_contacts"].notna()
    d["is_trial"] = d["init_plan_type"].astype(str).str.contains("trial")

    base, n_base = rate(d)
    print(f"source     {SOURCE.name}  sheet {SHEET}")
    print(f"raw rows   {len(raw):,}  ->  deduped on order_id: {len(d):,} "
          f"({len(raw) - len(d):,} duplicate rows dropped)")
    print(f"date range {raw.created_at.min():%Y-%m-%d} to {raw.created_at.max():%Y-%m-%d}")
    print(f"\nBASELINE   {d.ret.sum():,} retained / {(len(d) - d.ret.sum()):,} cancelled "
          f"of {n_base:,} = {base:.1%}   {verdict(base, CLAIMS['baselineRetained'])}")

    # ---- every claim in the brief's table -------------------------------------
    print("\n" + "-" * 72)
    print("THE BRIEF'S §4 TABLE, RECOMPUTED")
    print("-" * 72)

    cyc = by(d, "billing_cycle")
    show("billing cycle", cyc)
    ty = cyc.loc["two_yearly", "retained"]; mo = cyc.loc["monthly", "retained"]
    print(f"  two_yearly {ty:.1%} {verdict(ty, CLAIMS['twoYearly'])}")
    print(f"  monthly    {mo:.1%} {verdict(mo, CLAIMS['monthly'])}")
    print(f"  gap {ty/mo:.1f}x — this is what rules.ts defaults to yearly for, and it holds")

    off = by(d, "neo_offering")
    show("model", off)
    cs = off.loc["co.site", "retained"]; cd = off.loc["custom domain", "retained"]
    print(f"  co.site {cs:.1%} {verdict(cs, CLAIMS['coSite'])}")
    print(f"  custom  {cd:.1%} {verdict(cd, CLAIMS['customDomain'])}")
    print("  NOTE: co.site ahead by 13pt. This contradicts the 2026 strategy doc, and it")
    print("        contradicts the Athena export (custom 38.2% vs co.site 33.4%). Unresolved.")

    lg = by(d, "login_tag")
    show("login", lg)
    nl = lg.loc["No-login", "retained"]
    print(f"  never logged in {nl:.1%} {verdict(nl, CLAIMS['neverLoggedIn'])}")

    imp = by(d, "import_emails_contacts")
    show("import intent", imp)
    both = imp.loc["Yes, import both emails and contacts"]
    only = imp.loc["Yes, import emails"]
    no = imp.loc["No, don’t want to import"]
    print(f"  both   {both.retained:.1%} n={int(both.n)} "
          f"{verdict(float(both.retained), CLAIMS['importBoth'])} "
          f"(brief n={CLAIMS['importBothN']}, "
          f"{'n matches' if int(both.n) == CLAIMS['importBothN'] else 'n DIFFERS'})")
    print(f"  emails {only.retained:.1%} n={int(only.n)} "
          f"{verdict(float(only.retained), CLAIMS['importEmailsOnly'])}")
    print(f"  ** and 'No, don't want to import' retains {no.retained:.1%} (n={int(no.n)}) **")

    apps = pd.DataFrame(
        [(c,) + rate(d[d[c].notna()]) for c in EMAIL_APPS],
        columns=["app", "retained", "n"],
    ).set_index("app").sort_values("retained", ascending=False)
    show("current email app (one-hot, non-null = picked)", apps,
         "brief claims Outlook/Gmail/iPhone Mail 77-84% — holds, iPhone Mail a shade under")

    # ---- the finding that actually matters -------------------------------------
    print("\n" + "-" * 72)
    print("THE IMPORT CLAIM IS A SELECTION EFFECT")
    print("-" * 72)
    ans = by(d, "answered_import")
    show("retention by whether the import field is filled at all", ans)
    a_true = ans.loc[True, "retained"]; a_false = ans.loc[False, "retained"]
    print(f"\n  answered {a_true:.1%} vs blank {a_false:.1%} — a {a_true/a_false:.1f}x gap,")
    print(f"  versus a {imp.retained.max() - imp.retained.min():.1%} spread *between* the answers.")
    print("  The discriminating variable is answering, not the answer.")

    print("\n  It is not just login — the gap survives holding login_tag fixed:")
    piv = (d.pivot_table(index="answered_import", columns="login_tag",
                         values="ret", aggfunc="mean") * 100).round(1)
    print(piv.to_string())

    print("\n  Nor billing cycle — it survives there too:")
    piv2 = (d.pivot_table(index="answered_import", columns="billing_cycle",
                          values="ret", aggfunc="mean") * 100).round(1)
    print(piv2.to_string())

    print("\n  And it is not 'answering anything is good'. Fields asked at signup go the")
    print("  other way, which is what marks import/current_email_app as later-stage:")
    field_rows = []
    for c in ["import_emails_contacts", "current_email_app", "signup_reason",
              "employee_count", "role_in_business", "business_industry"]:
        ar, an = rate(d[d[c].notna()]); br, bn = rate(d[d[c].isna()])
        field_rows.append({"field": c, "answeredRetained": round(ar, 4), "answeredN": an,
                           "blankRetained": round(br, 4), "blankN": bn})
        print(f"    {c:<24} answered {ar:>5.1%} (n={an:>6,})   blank {br:>5.1%} (n={bn:>6,})")

    # ---- knowable before purchase, or not --------------------------------------
    print("\n" + "-" * 72)
    print("SPLIT BY WHETHER THE APP COULD ACTUALLY KNOW IT PRE-PURCHASE")
    print("-" * 72)

    reasons = pd.DataFrame(
        [(c,) + rate(d[d[c].notna()]) for c in SIGNUP_REASONS],
        columns=["reason", "retained", "n"],
    ).set_index("reason").sort_values("retained", ascending=False)
    show("signup reason (asked at signup — genuinely pre-purchase)", reasons,
         f"spread only {reasons.retained.max()-reasons.retained.min():.1%} — "
         "which reason you pick says little")

    trial = by(d, "is_trial")
    show("started on a trial plan", trial)

    d["mbx_bin"] = pd.cut(d["mailbox_count"], [0, 1, 2, 5, 20, 1000],
                          labels=["1", "2", "3-5", "6-20", "21+"])
    mbx = by(d, "mbx_bin").sort_index()
    show("mailbox count", mbx,
         "flat and non-monotonic (34-40%) — does NOT replicate the Athena export, "
         "where m12 fell 7.4% -> 2.1% as mailboxes rose")

    print("\n  Post-purchase engagement, for contrast — strong but unavailable to the quiz:")
    for c in ["setting_tag", "site_editor_tag"]:
        g = by(d, c)
        for i, r in g.iterrows():
            print(f"    {c}={str(i):<22} {r.retained:>5.1%}  n={int(r.n):,}")

    print("\n  Usable pre-purchase, best first:")
    print(f"    billing cycle       two_yearly {ty:.1%} / yearly "
          f"{cyc.loc['yearly','retained']:.1%} / monthly {mo:.1%}   <- strongest")
    print(f"    paid vs trial       {trial.loc[False,'retained']:.1%} vs "
          f"{trial.loc[True,'retained']:.1%}")
    print(f"    co.site vs custom   {cs:.1%} vs {cd:.1%}   (contested — see note above)")
    print(f"    signup reason       {reasons.retained.min():.1%}-{reasons.retained.max():.1%}   weak")
    print(f"    mailbox count       {mbx.retained.min():.1%}-{mbx.retained.max():.1%}   weak/noisy")

    findings = {
        "_source": f"{SOURCE.name}, sheet {SHEET}, deduped on order_id",
        "_dateRange": f"{raw.created_at.min():%Y-%m-%d} to {raw.created_at.max():%Y-%m-%d}",
        "_computedOn": dt.date.today().isoformat(),
        "_computedBy": "analysis/scripts/retention_cuts.py",
        "_caveats": [
            "Deduped on order_id: 33,024 raw rows -> 18,399 unique orders.",
            "retention_tag is a single end-state flag, not a monthly cohort measure, so "
            "these levels are not comparable with the Athena m*_retained columns.",
            "2023-24 window and a 2023-24 product state — directional only.",
            "The import-intent and current_email_app cuts are selection effects: both "
            "fields are filled on the same 2,484 orders and reflect onboarding progress, "
            "not a preference available at pre-purchase time.",
        ],
        "rawRows": len(raw),
        "dedupedOrders": len(d),
        "duplicateRowsDropped": len(raw) - len(d),
        "baseline": {"retained": round(base, 4), "retainedCount": int(d.ret.sum()),
                     "cancelledCount": int(len(d) - d.ret.sum()), "n": n_base,
                     "claimed": CLAIMS["baselineRetained"]},
        "byBillingCycle": records(cyc, "billingCycle"),
        "byModel": records(off, "model"),
        "byLogin": records(lg, "login"),
        "byImportIntent": records(imp, "importIntent"),
        "byCurrentEmailApp": records(apps, "app"),
        "bySignupReason": records(reasons, "reason"),
        "byTrial": records(trial, "startedOnTrial"),
        "byMailboxCount": records(mbx, "mailboxCount"),
        "importSelectionEffect": {
            "answeredRetained": round(float(a_true), 4),
            "answeredN": int(ans.loc[True, "n"]),
            "blankRetained": round(float(a_false), 4),
            "blankN": int(ans.loc[False, "n"]),
            "ratio": round(float(a_true / a_false), 2),
            "spreadBetweenAnswers": round(float(imp.retained.max() - imp.retained.min()), 4),
            "note": "Answering the field predicts far better than which answer is given. "
                    "'No, don't want to import' retains 79.5% vs 82.4% for 'Yes, both'.",
        },
        "fieldAnsweredVsBlank": field_rows,
        "claimVerdicts": {
            "baseline36pct": verdict(base, CLAIMS["baselineRetained"]),
            "twoYearly73pct": verdict(ty, CLAIMS["twoYearly"]),
            "monthly31pct": verdict(mo, CLAIMS["monthly"]),
            "coSite43pct": verdict(cs, CLAIMS["coSite"]),
            "customDomain29_5pct": verdict(cd, CLAIMS["customDomain"]),
            "neverLoggedIn21pct": verdict(nl, CLAIMS["neverLoggedIn"]),
            "importBoth82pct": verdict(float(both.retained), CLAIMS["importBoth"]),
            "importBothN102": "CONFIRMED" if int(both.n) == CLAIMS["importBothN"] else "DIFFERS",
            "importEmailsOnly74pct": verdict(float(only.retained), CLAIMS["importEmailsOnly"]),
        },
    }
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(findings, indent=2) + "\n")
    print(f"\nwrote {OUTPUT.relative_to(REPO_ROOT.parent)}")


if __name__ == "__main__":
    main()

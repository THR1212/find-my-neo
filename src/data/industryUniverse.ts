/**
 * Opening size of the narrowing meter.
 *
 * Confirmed 2026-09-02 on `darrel-version` from `Neo_vs_Non-neo_clients.xlsx`
 * Sheet13: 5,318 distinct `business_industry` strings (n=13,833 non-null of
 * 13,968 rows). Source of record: `analysis/output/findings.json`.
 *
 * Do not change this without recomputing that file. The decay of remaining()
 * still lives in the engine; this is only the universe we open on.
 */
export const DISTINCT_INDUSTRY_VALUES = 5318;
export const DISTINCT_INDUSTRY_N = 13833;
export const PERSONA_SHEET_ROWS = 13968;

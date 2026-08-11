# TNI Report — enforce the continuity rule properly (ADR-252b)

## What I verified (not assumed)

Running the live qualification function for April–June 2026 at threshold 3:

| Scored months used | Qualifying KPI rows |
|---|---|
| 1 month only | 363 |
| 2 months | 94 |
| all 3 months | 284 |

So 457 of 741 reported rows qualified on **one or two** months — exactly the "any month" behaviour you are seeing.

Two confirmed causes:

1. **The "minimum scored months" setting is never applied to TNI.** The `Consecutive months (1–24)` value you set to 3 is currently read only by PIP. The TNI qualification function takes no such argument and the report passes none, so a KPI scored below 3 in a single month still qualifies.
2. **Months are wrongly treated as "unscored".** Qualification only looks at the `final_score` column. In April–June 2026 there are 123 / 98 / 83 submissions per month with no final score but a manager / auditor / skip-level / HR / management / self score present. Those months are silently skipped instead of compared to the threshold — so a month where the KPI actually scored 4.5 does not disqualify the KPI.

## What changes

1. **Pass the window to TNI.** Extend the qualification function with a minimum-scored-months argument and require `scored_months >= minimum`. The report passes the same `Consecutive months` value shown in the "TNI Threshold Criteria" strip, so both inputs on that card finally govern the report together.
2. **Use the canonical score cascade.** Replace the bare `final_score` read with the standard fallback (final → management → HR → skip-level → auditor → manager → self), matching the universal scoring logic used elsewhere. A month counts as unscored only when no stage has scored it or it is marked N/A.
3. **Make the rule visible.** The alert under the filter states the effective rule, e.g. *"Reported only when the KPI is at or below 3.00 in every scored month and has at least 3 scored months in the selected range (3 months)."* Plus a small "excluded: short window" count so dropped rows are explainable.
4. Keep the shared TS evaluator (`allMonthsAtOrBelow`) and the SQL function in lockstep — both already do `<=` and skip-unscored; only the minimum-window gate and the score source change.

## Expected effect

For April–June 2026 at threshold 3 / minimum 3, the report goes from ~741 rows to ~284 before the cascade fix, and slightly lower after it (months previously skipped will now disqualify some KPIs). PIP detection uses the same evaluator and stays consistent.

## Technical notes

- Migration: `CREATE OR REPLACE FUNCTION public.tni_qualified_kpis(p_periods jsonb, p_threshold numeric, p_min_scored_months int DEFAULT 1)` — additive default keeps existing callers working; add `and count(*) >= p_min_scored_months` to the `having`; swap the score expression to `coalesce(rs.final_score, rs.management_score, rs.hr_pms_score, rs.skip_level_score, rs.auditor_score, rs.manager_score, rs.self_score)`.
- `src/hooks/useTniQualification.ts`: accept and forward `minScoredMonths`, include it in the query key.
- `src/pages/reports/TNIReport.tsx`: read `pip_consecutive_months` (already fetched by `TniThresholdInline`) and pass it through; update the rule alert text.
- Tests: extend `src/test/tni/continuityRule.test.ts` with (a) below threshold in 1 of 3 months → not qualified, (b) a month scored only at manager stage above threshold → disqualifies.
- Docs: `DOCUMENTATION.md` + `POLICY.md` §PMS-CONTINUITY-AT-OR-BELOW updated for the minimum-window gate and score-cascade source (ADR-252b).

## Risk

- No schema or data change; the function is replaced in place and stays read-only. Rollback = restore the previous body.
- TNI row counts will legitimately drop; PIP candidates may drop slightly for the same reason.
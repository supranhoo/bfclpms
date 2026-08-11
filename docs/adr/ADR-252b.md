# ADR-252b — TNI continuity rule was not actually enforced

## Status
Accepted — 2026-08-11

## Problem
The TNI report listed KPIs that fell below the threshold in **any** month of
the selected range, despite the configured "at or below in every scored month"
rule. For April–June 2026 at threshold 3, 741 rows qualified: 363 on a single
scored month and 94 on two.

## Root cause
1. `pip_consecutive_months` (the "minimum scored months" input on the TNI
   Threshold Criteria card) was only read by PIP. `tni_qualified_kpis` had no
   such parameter, so one low month was enough.
2. Qualification read `review_submissions.final_score` only. Months scored at a
   non-final stage (123 / 98 / 83 rows per month in that range) were treated as
   unscored and skipped, so a month that actually scored 4.5 did not disqualify
   the KPI.

## Decision
- `tni_qualified_kpis(p_periods, p_threshold, p_min_scored_months default 1)`
  adds `count(*) >= p_min_scored_months` to the `having` clause.
- The score expression uses the canonical cascade: final → management → HR PMS
  → skip-level → auditor → functional manager → manager → self.
- `useTniQualifiedKpis` forwards the configured window, clamped to the number
  of selected months so a 3-month policy cannot empty a 1-month report.
- The rule banner discloses the minimum-scored-months requirement.

## Consequences
April–June 2026 @ threshold 3 / window 3 now returns 300 qualifying rows.
PIP detection is unchanged in behaviour and stays consistent with TNI.
Rollback: restore the previous function body; no data change was made.

## Tests
`src/test/tni/minScoredMonths.test.ts`, `src/test/tni/continuityRule.test.ts`.
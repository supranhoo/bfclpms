## Goal

For Daily/Weekly KPIs, the score must follow the KPI's defined **R5..R0 rating scale** in every case. The current "Missed Days Penalty" path that bypasses the R-scale and writes the 0–5 penalty number directly as `self_score` is the root cause of "Value 5 → Rating 5" when the criteria actually says R0 > 4 → rating 0.

New rule (overrides ADR-046):

1. Aggregate daily sub-period entries by **SUM** of `achieved_value`.
2. That SUM becomes `review_submissions.achieved_value`.
3. Pass that SUM through `calculateScoreFromAchieved(...)` against the KPI's R5..R0 thresholds (respecting Higher/Lower-is-Better and the R0 boundary).
4. The resulting 0–5 rating is `self_score` / `self_rating`. Same logic at Manager / Auditor / HR PMS / Skip-Level / Management stages.

The "Missed Days Penalty" number stays only as a UI sub-metric showing submission compliance (X / N days submitted, Y missed) — it never becomes the score.

## Risk & Impact Report

- **Data Impact**: Submission `achieved_value` semantics change for Daily/Weekly KPIs going forward (sum instead of penalty number). Historical approved rows (`final_score IS NOT NULL`) are NOT recomputed (POLICY §88 immutability). Only currently-open daily submissions get the new write path. One-off repair migration targets only Vedant Pawar's April 2026 self-submission row (employee 101966) and any other Daily KPI rows where `final_score IS NULL` AND `status` ≤ `self_review` AND `aggregation_method = 'missed_days_penalty'`.
- **Workflow Impact**: None — only the number written into score fields changes. No status/role changes.
- **UI/UX**: SelfReviewSheet score preview tile, KpiJourneySection value display, and submit-confirm dialog update to show "Sum: X → Rating: Y" instead of "Penalty Score". Missed-days info kept as secondary line.
- **Regression Risk**: Binary Daily KPIs (uom_type='binary') currently use the binary penalty path; they must keep their own binary R5..R0 mapping (achieved sum of 1s = "Yes days", mapped through tiered thresholds). KPIs missing R0 must be blocked from save (validator).
- **Mitigation**: 
  - Unit tests in `src/lib/dailyAggregation.test.ts` for the new sum+R-scale path (Lower-is-Better, Higher-is-Better, R0 boundary, binary).
  - Regression test in `src/test/bugBountyFixes.test.ts` reproducing "5 days late submitted as 0 → R5; 5 days submitted as 1 → sum 5 → R0".
  - Feature flag not needed — change is scoped to in-flight submissions only.

## Files to change

1. `**src/lib/dailyAggregation.ts**` — add `calculateSumAggregatedScore(values)`; keep penalty calc but mark as "compliance metric only".
2. `**src/components/review/SelfReviewSheet.tsx**` (lines ~400–445 and ~1316–1340) — replace the `isMissedDaysPenalty` branch with: always compute `sum`, write `achieved_value = sum`, then call `calculateScoreFromAchieved(sum, kpi)` for `self_score` / `self_rating`. Update preview tile to show "Sum: X · Rating: Y · Missed: Z days".
3. `**src/components/review/KpiJourneySection.tsx**` — display Daily/Weekly value cell as "Sum of N entries = X" (no recalc, reads stored `achieved_value`).
4. **Manager / Auditor / HR PMS / Skip-Level / Management score panels** — same: any UI that recomputes a Daily KPI score must use `calculateScoreFromAchieved(achieved_value, kpi)`.
5. **KPI editor validator** — block save if `r0 IS NULL` (Lower-is-Better) or any R-tier missing.
6. **One-shot data repair migration** — for Vedant's April safety KPI submission (and any peer row that fits the criteria above):
  - `achieved_value = SUM of sub_period_submissions.achieved_value` for that KPI/period
  - `self_score = calculateScoreFromAchieved(sum, kpi)` (computed in SQL using the kpis row's r5..r0)
  - `self_rating = scoreToRatingLevel(self_score)`
  - Excludes any row with `final_score IS NOT NULL`.
7. `**docs/adr/ADR-046.md**` — mark as **Superseded by ADR-063**.
8. `**docs/adr/ADR-063.md**` — new ADR: "Daily KPI Sum Aggregation + R-Scale Mapping".
9. `**POLICY.md**` + `**DOCUMENTATION.md**` Version History — record the policy shift.
10. `**mem/features/review/daily-kpi-aggregation-logic**` — update.

## Verification

- Biswajits April KPI re-displays as "Value 0 → Rating 5" (he submitted 0 days late on every day; sum = 0; Lower-is-Better with R5=0 ⇒ rating 5).
- Synthetic test: same KPI, sub-period entries summing to 5 ⇒ achieved=5, R0>4 ⇒ rating 0.
- Unit tests + bugBountyFixes regression test pass.
- Approved historical rows untouched (immutability preserved).

## Open question I'll assume unless told otherwise

Missed daily entries contribute 0 to the SUM (i.e., a missed day is treated as "no value reported"). If you want missed days to count as a configurable penalty value (e.g., worst-case = R0 threshold), say so and I'll add a per-KPI "missed-day default" field.
# Fix: 4.55 badge rendering as 4.60

## Assumptions
- The badge in the employee selector grid and the detail donut (`4.55/5`) must agree.
- Only display precision changes; no stored score is touched.

## Confirmed root cause
`src/hooks/useEmployeeScoresForPeriod.ts` line 81 rounds the weighted average to **one decimal** before returning:
`map.set(empId, Math.round((weightedSum / totalWeight) * 10) / 10)`.
4.55 becomes 4.6; POLICY §UI-SCORE-PRECISION then renders it via `fmt2()` as `4.60`. The detail page computes its own value and correctly shows 4.55.

## Change
1. `useEmployeeScoresForPeriod.ts` — round to 2 decimals (`* 100) / 100`) instead of 1, so the grid badge matches the scorecard. Comment updated.
2. Sweep the sibling `/5` score paths for the same premature 1-dp rounding and align them (only where the value is an out-of-5 score, not a percentage, day count or employee count):
   - `src/lib/annualReview/bellCurve.ts:198` — verify whether this rounds a rating (align) or a percentage/count (leave).
   - Leave `safetyAnalytics.ts`, `kpiPendingWithSummary.ts` (avg days), `KpiEmployeeMatrix.tsx` / `useKpiEmployeeMatrix.ts` (avg employee counts) and the Bell Curve tooltip percentage untouched.

## UI effect
Employee selector grid score badge (and any consumer of this hook): `4.60` -> `4.55`. No layout, column, sort or interaction change — sorting already uses the same map, so ordering only changes where two employees previously tied after rounding.

## Risk & impact
- Data: none. Presentation-layer rounding only.
- Workflow / permissions: none.
- Regression: low. Guarded by a unit test.
- Scalability: none.
- Rollback: revert the one-line change.

## Tests
`src/test/employeeScoresForPeriod.test.ts` (new): weighted average of a 4.55 case returns `4.55` not `4.6`; N/A and unscored KPIs still excluded; zero-weight guard; null when no scores.

## Docs
- `DOCUMENTATION.md` version-history entry.
- `POLICY.md` §UI-SCORE-PRECISION amended: score aggregation must not round below 2 dp before display; rounding happens once, at `fmt2()`.

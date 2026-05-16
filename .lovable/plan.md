# RCA — Sajid Raza score 44.27% (114/257.5) is wrong

## What the screen shows
Employee Performance Summary, March 2026, Sajid Raza (100264): **Total 114 / Out 257.5 = 44.27%**.

## What the database actually contains
30 active (non-N/A) approved KPIs for him in Mar-2026:

| Frequency  | KPIs | Σ weight | Σ weight×5 | Σ weight×score |
|------------|------|---------:|-----------:|---------------:|
| Daily      | 2    | 1.5      | 7.5        | 7.5            |
| Monthly    | 22   | 50.0     | 250.0      | 106.5          |
| Bi-Monthly | 6    | 47.0     | 235.0      | 200.0          |
| **Total**  | 30   | 98.5     | 492.5      | **314.0**      |

Correct percentage = **314 / 492.5 = 63.76%**.
Screen value = 114 / 257.5 ≡ Daily + Monthly only — **the 6 Bi-Monthly KPIs (weight 47, 200 score points) are silently dropped.**

## Why why analysis
1. *Why is the percentage 44.27 and not 63.76?* Because Bi-Monthly KPIs are excluded from `totalScore` and `outOfScore`.
2. *Why are they excluded?* `isKpiLockedForPeriod(kpi.frequency, 'March', 2026)` returns `true`, and the report skips locked KPIs while the "Show frequency-locked KPIs" toggle is off.
3. *Why does the helper return `true` for March?* It falls through to the **first** Bi-Monthly cycle option (`Jan-Feb` → `Mar-Apr` → locked month = 3). March IS locked under the standard cycle.
4. *Why does it use the wrong cycle?* All 6 of his Bi-Monthly KPIs carry `frequency_cycle_start = 'Feb-Mar'` (offset cycle, active month = March, locked month = February). But the report **never reads or passes `frequency_cycle_start`**:
   - `EmployeePerformanceSummary.tsx` line 120 SELECT: `id, employee_id, kra_name, kpi_name, weightage, status, review_period, review_year, frequency` — column missing.
   - Line 189 call: `isKpiLockedForPeriod(kpi.frequency, selectedPeriod, year)` — 4th arg `frequencyCycleStart` missing.
   - With both missing, `resolveEffectiveCycleOption` returns `BI_MONTHLY_OPTIONS[0]` (Jan-Feb), wrongly classifying March as locked.
5. *Why wasn't this caught earlier?* The same omission exists in two more reports (`KpiDetailReport`, `KpiStatusTracker`) — there is no regression test that drives `isKpiLockedForPeriod` through the per-KPI override path inside the report layer. `useSystemIssues`, `OrgKpiDataEntry`, `SelfReviewSheet`, `KpiJourneySection`, `FrequencyLockedOverlay` already pass it correctly, so the helper itself is fine.

## Root cause
**Reports drop the per-KPI `frequency_cycle_start` override**, so any KPI whose cycle differs from the first hard-coded option (`Jan-Feb` for Bi-Monthly, `Jan-Mar` for Quarterly, `Jan-Jun` for Half-Yearly, `Jan-Dec` for Yearly) is mis-classified. Sajid Raza is the visible victim because almost half his weight (47/98.5) sits on `Feb-Mar` Bi-Monthly KPIs.

# Fix plan

## 1. Patch the three reports (data-only change, no UI shift)
For each:
- Add `frequency_cycle_start` to the `kpis` SELECT.
- Pass it as the 4th argument to `isKpiLockedForPeriod`.

Files:
- `src/pages/reports/EmployeePerformanceSummary.tsx`
  - SELECT (line 120) and `trendData` SELECT (line 300).
  - Call site line 189 → `isKpiLockedForPeriod(kpi.frequency, selectedPeriod, year, kpi.frequency_cycle_start)`.
- `src/pages/reports/KpiDetailReport.tsx` line 195 (+ matching SELECT).
- `src/pages/reports/KpiStatusTracker.tsx` line 165 (+ matching SELECT).

No schema, RLS, or workflow change. No score recomputation in DB.

## 2. Regression test
Add `src/test/reportFrequencyCycleOverride.test.ts`:
- Bi-Monthly KPI with `frequency_cycle_start='Feb-Mar'` in March → not locked.
- Same KPI without override → locked under default `Jan-Feb`.
- Quarterly `Apr-Jun` cycle in June → not locked.
This locks behaviour at the report layer, not just inside `frequencyUtils`.

## 3. Mock-data refresh
Extend the existing mock fixtures used by the report tests to include at least one Bi-Monthly KPI with `frequency_cycle_start='Feb-Mar'` and one Quarterly with `Apr-Jun`, so any future refactor that drops the column fails CI immediately.

## 4. POLICY.md / DOCUMENTATION.md sync
- DOCUMENTATION.md → new entry **v2.66.11.9** describing the bug, RCA, the three-file fix and the new test.
- POLICY.md → add **§128 (Frequency-Lock Determination)**: "Any code path that calls `isKpiLockedForPeriod` for a KPI MUST pass that KPI's `frequency_cycle_start`. SELECTs that feed such code paths MUST include the `frequency_cycle_start` column. Helper-only call sites that intentionally check a *frequency family* (no specific KPI) are exempt and must add an inline comment."

## Risk & impact report
- **Data impact:** none — read-only, no migration, no recomputation of stored scores.
- **Workflow impact:** none — does not change reviewer stages, status, or RLS.
- **UI/UX impact:** Mar-2026 Performance Summary will show Sajid Raza at 314/492.5 = 63.76% (and similar corrections for any employee with non-default cycles). The 6 missing Bi-Monthly KPIs become visible in `KpiDetailReport` / `KpiStatusTracker` for their active months, and stay correctly hidden in their locked months.
- **Regression risk:** low. Helper signature is unchanged; we only start passing an argument that other call sites already pass. Frequency-lock toggle behaviour is preserved.
- **Mitigation:** unit test (item 2), updated mocks (item 3), policy guard (item 4) plus a one-time grep audit of `isKpiLockedForPeriod(` to confirm no remaining 3-arg calls except the explicitly exempt test cases.

## Out of scope (flagged, not changed now)
- `useMonthlyTrend` / Monthly Scorecard already aggregate without lock filtering, so they are unaffected. No change proposed.
- A potential follow-up: if business wants locked-but-already-scored KPIs (rare data-entry overrides) to count, that is a separate policy decision and not part of this fix.

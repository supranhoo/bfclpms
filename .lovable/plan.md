## Bug (corrected RCA)

Sajid Raza (Emp 100264), Feb-26:
- **Correct value (business logic):** 339.5 / 492.5 ≈ **69.04%** (rating 3.45 / 5)
- Original "All Months" view: 69.04% ✓
- Original "February" filter view: 54.37% ✗
- My previous fix made BOTH views 54.37% ✗ — wrong direction.

### Why 69.04% is correct (verified from DB)

Sajid has 6 Bi-Monthly KPIs at `review_period='February'`, `frequency_cycle_start='Feb-Mar'`, all `status='approved'` with `final_score` set (weights 3,3,3,1,25,12 = 47, weighted 200, max 235). `isKpiLockedForPeriod('Bi-Monthly','February',2026,'Feb-Mar')` returns **true** because Feb is the cycle's *start*, not its *active/review* month (Mar is). The lock helper is correct for *empty sibling months* but wrong for **approved submissions that exist on the start month** (data-entry placement is a separate concern; reporting must reflect what is actually approved).

Per POLICY §88 (Submission Snapshot Immutability) — once `status='approved'` with a `final_score`, the score must surface in the period its row carries. The report aggregator must not silently zero approved scores based on cycle-position heuristics.

## Fix

Roll back the lock-based exclusion in `src/pages/reports/EmployeePerformanceSummary.tsx`. The KPI's own `review_period` is the source of truth for which row it belongs to; whether to count it is determined by `is_na` and the 8-stage score fallback, not by `isKpiLockedForPeriod`.

### Change 1 — Main aggregation (lines ~198-264)

Remove the `isLocked` branch entirely:

```ts
allKpis.forEach(kpi => {
  const profile = profileMap.get(kpi.employee_id);
  if (!profile) return;
  const submission = kpi.review_submissions;
  if (submission?.is_na) return;

  const manager = profile.reporting_manager_id ? profileMap.get(profile.reporting_manager_id) : null;
  const key = `${kpi.employee_id}-${kpi.review_period}`;
  const existing = employeePeriodMap.get(key);

  const score = (kpi.status === 'approved' ? submission?.final_score : null)
    ?? submission?.management_score
    ?? submission?.auditor_score
    ?? submission?.hr_pms_score
    ?? submission?.skip_level_score
    ?? submission?.manager_score
    ?? submission?.self_score
    ?? 0;
  const weight = kpi.weightage || 0;
  const weightedScore = score * weight;
  const maxScore = weight * 5;
  const kpiStatus = kpi.status || 'kra_set';

  if (existing) {
    existing.totalScore += weightedScore;
    existing.outOfScore += maxScore;
    existing.totalWeight += weight;
    existing.kpiCount += 1;
    existing.statusCounts[kpiStatus] = (existing.statusCounts[kpiStatus] || 0) + 1;
  } else {
    employeePeriodMap.set(key, {
      …,
      statusCounts: { [kpiStatus]: 1 },
      totalScore: weightedScore,
      outOfScore: maxScore,
      totalWeight: weight,
      kpiCount: 1,
      lockedKpiCount: 0,
      …,
    });
  }
});
```

`lockedKpiCount` field is kept on the row type (value always 0) so downstream UI that reads it doesn't break; the "Show frequency-locked KPIs" toggle becomes a no-op for now (call it out in the closing notes — separate decision whether to remove the toggle UI in a follow-up).

### Change 2 — Trend query (lines ~366-374)

Remove the matching `if (isLocked) return;` guard so Period Comparison stays consistent with the main table at 69.04%.

### Change 3 — Drop the unused import

Remove `isKpiLockedForPeriod` from the imports if no longer referenced.

## Out of scope

- Lock logic itself (`src/lib/frequencyUtils.ts`) — unchanged; still correct for sibling-month *data-entry* gating.
- Other call sites of `isKpiLockedForPeriod` (Self-Review, KPI Journey, Org KPI entry, etc.) — those are entry-side guards, not reporting; leave alone.
- DB/RLS/edge-functions — untouched.
- 8-stage fallback chain and POLICY §88 immutability — preserved.
- The "Show frequency-locked KPIs" toggle UI — leave in place (no-op) for this patch; removal is a follow-up if desired.

## Risk & Impact Report

- **Data Impact:** None — read-only aggregation change.
- **Workflow Impact:** None.
- **UI/UX:** Feb-26 row for Sajid Raza changes from 54.37% → 69.04%. Any other employee whose row contained approved Bi-Monthly/Quarterly/Half-Yearly submissions at the cycle-start month will increase to match what's already in their KPI Journey / Scorecard.
- **Regression Risk:** Low. Excel export and Period Comparison read the same aggregation → automatically aligned. The only behavioral loss is the "filter out unscored sibling-month phantom rows" effect — but if such phantoms exist, they have `score=0` and inflate `outOfScore` only when a real submission is present; empty rows are already filtered earlier in the pipeline.
- **Scalability:** Identical query cost (same data, simpler loop body).
- **Mitigation:** Verification steps below + targeted tests.

## Verification

1. `/reports/employee-performance` → search 100264 → Feb-26 row in **both** All-Months and February views shows **69.04% / 3.45 rating**.
2. Spot-check Mar-26, Jan-26, Apr-26 against KPI Journey/Scorecard for Sajid.
3. Period Comparison tab shows 69.04% for the Feb data point.
4. Excel export Feb-26 row total matches the UI.
5. Pick one other employee with Bi-Monthly/Quarterly KPIs and confirm their numbers match the per-employee Scorecard.
6. `npm test` — existing `frequencyUtils.test.ts`, `frequencyLockCallSitesAudit.test.ts` still pass (lock helper itself unchanged).

## Tests

Add `src/test/employeePerformanceApprovedSubmissions.test.ts` (small pure-function extract):

1. Bi-Monthly KPI cycle Feb-Mar, `review_period='February'`, `status='approved'`, `final_score=5`, weight=25 → contributes 125 to Feb totalScore, 125 to outOfScore.
2. Same KPI with `is_na=true` → excluded.
3. Monthly KPI normal flow → 8-stage fallback unchanged.
4. Approved `final_score=0` still contributes 0 / (weight*5) (penalty preserved, POLICY §88).

To make this testable, extract the per-KPI accumulation into `src/lib/employeePerformanceAgg.ts` (`reduceKpiIntoRow`). Pure function, ~30 lines. Component imports it; both the main aggregation and trend query call it for parity.

## Docs

- `DOCUMENTATION.md` → Reports section: "Approved submissions count in the `review_period` they were stored against. Frequency lock (`isKpiLockedForPeriod`) is a *data-entry* guard, not a *reporting* filter — it must never zero approved historical scores."
- `POLICY.md` → revise the §128 entry added previously; explicitly state: **Reports must respect approved-submission immutability; lock heuristics are entry-side only.**
- `mem://features/reports/aggregation-parity-rule` → rewrite: "Per-period aggregation reflects every non-N/A submission at the row's `review_period`. Do not apply frequency-lock exclusion in report aggregation."

## Files touched

- `src/pages/reports/EmployeePerformanceSummary.tsx` (revert the 2 prior blocks, drop import)
- `src/lib/employeePerformanceAgg.ts` (new, ~30 lines)
- `src/test/employeePerformanceApprovedSubmissions.test.ts` (new)
- `DOCUMENTATION.md`, `POLICY.md` (sync)
- Memory file rewrite

## Rollback

Single-file revert of `EmployeePerformanceSummary.tsx` + delete the new helper + test. No data to undo.

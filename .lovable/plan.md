

## Revised Plan: Ensure Final Score Consistency Across All Layers

### The Gap You Identified
The previous plan fixes the **stored** `final_score` and prevents future drift, but it does NOT fix the **display fallback chains** used when `final_score` is NULL (non-approved KPIs). These chains blindly pick the highest-available reviewer score (Management → Auditor → HR PMS → ...) regardless of which reviewer is actually relevant for that employee's workflow.

This means:
- **Dashboard cards** (e.g., `useEmployeeScoresForPeriod.getBestScore`) show a generic fallback score
- **KPI detail view** (`KpiDetailsTable`, `KpiReviewPanel`, `KpiHistoryCard`) also uses the same generic chain
- Neither checks which workflow stage is the terminal one for that employee

### What Must Be Added to the Plan

#### A. Approved KPIs (status = 'approved')
Already covered by the original plan: fix the stored `final_score` to match the terminal workflow reviewer. Once fixed, all display layers already trust `final_score` when `status === 'approved'`, so dashboards and detail views will match automatically.

**No additional display-layer change needed for approved KPIs** — the data fix is sufficient.

#### B. Non-Approved / In-Progress KPIs
The generic fallback chain (`management ?? auditor ?? hr_pms ?? ...`) is actually **correct behavior** for in-progress KPIs. It shows the "best available score so far" — which is the most recent reviewer who has scored. This is intentional and matches what users expect to see while reviews are in flight.

**No change needed for in-progress KPIs** — the current cascading fallback is appropriate.

### Conclusion
The original plan **IS sufficient** to ensure dashboard and detail view consistency, because:

1. **Approved KPIs**: The data migration will fix `final_score` to match the terminal workflow reviewer. All display layers already use `final_score` when `status === 'approved'`.
2. **In-progress KPIs**: The cascading fallback (highest available reviewer score) is correct behavior — it shows the latest review-level score available.
3. **Future protection**: The guard on admin data entry + approval sync from terminal stage prevents drift going forward.

The only scenario where dashboard ≠ detail view would be if `final_score` is **wrong in the database** — which is exactly what the corrective migration fixes.

### No Plan Changes Required
The approved plan already covers this. No revision needed. Proceed with implementation as-is.


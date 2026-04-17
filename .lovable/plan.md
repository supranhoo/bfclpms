

## Plan: Incentive Report — Employee-wise View with Final Rating & Status

### Current State (from `MonthlyIncentiveTable.tsx` reference & screenshot)
The Incentive Report table currently shows one row per `employee_incentive_record` with columns: Employee, Dept, Month, Period, PMS Score, Slab, Base %, DQ Reason, LTI Penalty, Pro-rata, Final %, Amount, DQ/Incentive Status, Workflow, Override.

User wants:
1. **One row per employee** (employee-wise consolidation, not per-record)
2. Show **Final Rating** column (employee's PMS final rating for the period)
3. Remove **Dept** and **Month** columns from the **frontend table only** — keep them in **Excel export**
4. Add a **Status** column = "Approved" if ALL the employee's KPIs in the selected period are status=`approved`/`final_approved`, else "Pending"

### Approach

**1. Data layer** (`useIncentiveRecords.ts` or new hook):
   - Fetch incentive records for selected month/year/program (existing).
   - Additionally, for each employee in the result, fetch their KPIs for that period from `kpis` table — group by `employee_id`, count total vs `final_approved`/`approved`. 
   - Compute per-employee aggregate: `kpiStatus = allApproved ? 'Approved' : 'Pending'`.
   - Final rating: derive from employee's weighted avg score for the period (use existing scoring logic in `weightedScore.ts` / `universal-scoring-logic`) → map to rating label via `RatingBadge`.

**2. UI layer** (`MonthlyIncentiveTable.tsx`):
   - Remove `Dept` and `Month` `<TableHead>` + cells from the table render.
   - Add `Final Rating` column → render via `<RatingBadge score={...} />`.
   - Add `Status` column → green badge "Approved" / amber "Pending".
   - Keep summary cards, filters, and bulk actions unchanged.
   - If multiple incentive records exist per employee in the same period (rare but possible across slabs/programs), aggregate to one row showing summed amount + first slab.

**3. Excel export** (`IncentiveReportExport` per ADR-041):
   - **Unchanged** — continues to include Dept, Month, and all 28+ DQ/audit columns.
   - The table view diverges from the export deliberately (UI = quick scan; export = full audit).

### Risk & Impact

| Area | Impact |
|------|--------|
| Data | None — read-only aggregation; no schema change |
| Workflow | None — bulk Confirm/Mark Paid still operate on underlying record IDs (mapped from the aggregated row) |
| RLS | None |
| Regression | Low — Excel export untouched (ADR-041 honored). Bulk actions need the aggregated row to expose its constituent record IDs for selection |
| Mitigation | Aggregate row stores `recordIds: string[]`; checkbox selects all underlying IDs for confirm/pay actions |

### Files Touched

| File | Change |
|------|--------|
| `src/hooks/useIncentiveRecords.ts` | Extend `useIncentiveRecords` (or add `useIncentiveRecordsWithKpiStatus`) to fetch KPI counts + final ratings per employee for the period |
| `src/components/incentive/MonthlyIncentiveTable.tsx` | Remove Dept/Month columns; add Final Rating + Status columns; aggregate to employee-level rows; map row selection to underlying record IDs |
| `src/components/incentive/IncentiveReportExport.tsx` (or wherever export lives) | **No change** — keep all columns including Dept/Month |
| `DOCUMENTATION.md` / `POLICY.md` | v2.65.x — Incentive UI shows employee-wise rollup with Final Rating + KPI Status; export remains row-level full-detail |

### Out of Scope
- Excel export structure (preserved per ADR-041)
- Retroactive Adjustments tab (separate component, untouched)


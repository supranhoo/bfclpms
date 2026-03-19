

## Fix: N/A KPIs Show "—" Instead of "N/A" in Journey Report

### Problem
When a KPI is marked Not Applicable, all timeline columns display "—" (dash), which is indistinguishable from a KPI that is genuinely pending. Users cannot tell which KPIs are N/A vs incomplete.

### Plan

#### 1. Add `isNa` field to `KpiJourneyRow` interface and populate it
**File:** `src/hooks/useKpiJourneyReport.ts`

- Add `isNa: boolean` to the `KpiJourneyRow` interface.
- Fetch `is_na` alongside existing fields from `review_submissions`.
- Set `isNa` from the submission record (fallback `false`).

#### 2. Display "N/A" instead of "—" for N/A KPIs in the table
**File:** `src/pages/reports/KpiJourneyReport.tsx`

- Update `formatDate` calls for timeline columns: if `row.isNa` is true and the date is null, render an amber "N/A" badge instead of "—".
- Update the Status column: show "N/A" badge for N/A KPIs.
- Update the compliance column: N/A KPIs should show a neutral indicator (not red alert).
- Add "N/A" as a filter option in the Status dropdown.

#### 3. Handle N/A in summary stats
- Exclude N/A KPIs from "Still Pending" count (they are not pending).
- Exclude N/A from average days calculations.

#### 4. Handle N/A in Excel export
- Show "N/A" in timeline columns and status for N/A KPIs.

### Files Changed
| File | Change |
|------|--------|
| `src/hooks/useKpiJourneyReport.ts` | Add `isNa` to interface, fetch `is_na` from submissions |
| `src/pages/reports/KpiJourneyReport.tsx` | Render "N/A" badge, filter option, fix stats, fix export |


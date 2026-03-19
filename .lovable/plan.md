

## Fix: Show Timestamp for N/A KPIs Instead of "N/A" Text

### Problem
N/A KPIs show "N/A" in all timeline columns because:
1. **Hook**: The fallback logic only populates `selfSubmittedAt` when `self_score != null` — but N/A KPIs have null scores, so `submitted_at` is never used
2. **UI**: `formatDateOrNa()` returns "N/A" when there's no date and `isNa=true`

The user wants to see **when** the KPI was marked N/A, not just that it is N/A.

### Fix

**File 1: `src/hooks/useKpiJourneyReport.ts`**
- In the fallback section (~line 152-189), add a special case: when `is_na=true` and `selfSubmittedAt` is missing, use `submitted_at` as the self-submitted timestamp (that's when the employee marked it N/A)
- This gives N/A KPIs their "marked at" timestamp

**File 2: `src/pages/reports/KpiJourneyReport.tsx`**
- Remove the `formatDateOrNa` helper — use `formatDate` for all timeline columns (timestamps will now be populated from the hook fix above)
- For columns that still have no date on N/A KPIs (manager, auditor, etc. — stages that were never reached), keep showing "—" which is correct since those stages genuinely didn't happen
- The Status column and compliance column already show "N/A" badge, so the N/A state is still clearly visible

### Result
- Self Submitted column shows the timestamp when N/A was marked
- Subsequent stages show "—" (correct — they were skipped)
- Status column still shows "N/A" badge for clear identification
- Total Days column still shows "N/A" badge


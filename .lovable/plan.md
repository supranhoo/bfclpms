
# Plan: Scoring Health Check — Impact Preview & KPI Editor — IMPLEMENTED ✅

## What Was Done

### 1. New Component: `src/components/admin/ScoringFixImpactDialog.tsx`
- Impact preview dialog that opens before any fix is applied
- Fetches all fiscal-year siblings (July–June cycle) and their `review_submissions`
- Simulates new scores client-side using `calculateRating()` with the corrected criteria
- Displays per-month table: Month, Year, Achieved Value, Current Score, Simulated Score, Change indicator
- Color-coded change arrows: green ↑ for improvements, red ↓ for decreases, grey — for unchanged
- Per-month checkboxes let admins select which months to apply the fix to
- Summary line shows selected count, improved/decreased/unchanged counts
- On confirm: updates only selected KPI IDs, writes audit log with `SCORING_HEALTH_FIX` action
- Works for both single-KPI fixes and bulk "Fix All" operations

### 2. Modified: `src/components/admin/ScoringHealthCheck.tsx`
- **Fix button** now opens the impact preview dialog instead of applying immediately
- **Fix All button** opens the impact preview with all fixable issues aggregated
- **Edit button** (Pencil icon) added to every issue row — opens `AdminKpiEditDialog` for manual editing
- Removed direct `fixInvertedCriteria` / `fixMissingCriteria` functions (logic moved to impact dialog)
- Removed `fixingIds` state (no longer needed since fixes go through the dialog)
- Exported `ScoringIssue` type for use by the impact dialog

### 3. No Database Changes Required
- Uses existing `kpis`, `review_submissions`, and `kpi_audit_logs` tables
- All simulation runs client-side on fetched data

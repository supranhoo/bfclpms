

# Plan: Impact Preview for All Severities + Bigger KPI Editor

## Issue 1: Impact Preview for High & Medium Issues

**Current State**: Only "Critical" issues (INVERTED_CRITERIA) and one "Medium" issue (MISSING_CRITERIA) show "Impact Preview" via the Fix button. Other High and Medium issues only show an "Edit" button because they aren't auto-fixable.

**Root Cause**: `canAutoFix()` on line 311 restricts the Fix/Impact Preview button to only `INVERTED_CRITERIA` and `MISSING_CRITERIA` types.

**Fix**: Add an "Impact Preview" button to ALL issue types (regardless of auto-fixability). For non-auto-fixable issues, the Impact Preview will show a read-only summary of affected employees across the fiscal year — their current achieved values, scores, and ratings — so admins can assess scope before manually editing.

### Changes

**`src/components/admin/ScoringHealthCheck.tsx`**:
- Add a new `handleImpactPreview` handler that opens `ScoringFixImpactDialog` in a **read-only mode** (no fix action)
- Add an "Impact Preview" button (Eye icon) to every issue row, alongside the existing Edit and Fix buttons
- The existing Fix button remains only for auto-fixable types

**`src/components/admin/ScoringFixImpactDialog.tsx`**:
- Accept a new `readOnly` prop (default `false`)
- When `readOnly = true`:
  - Hide the "Apply Fix" button in the footer
  - Hide the simulated score/rating columns (since there's no fix to simulate)
  - Show only: Month, Achieved Value, Current Score, Current Rating
  - Change dialog title to "Impact Preview" instead of "Scoring Fix Impact"
- This reuses all existing fiscal-sibling fetching and display logic

---

## Issue 2: Bigger Admin KPI Editor Window

**Current State**: `AdminKpiEditDialog.tsx` line 395 uses `max-w-3xl` (~768px).

**Fix**: Change to `max-w-5xl` (~1024px) for a wider editing experience.

**`src/components/admin/AdminKpiEditDialog.tsx`**:
- Change `max-w-3xl` → `max-w-5xl` on the `DialogContent`

---

### Files Modified
1. `src/components/admin/ScoringHealthCheck.tsx` — Add Impact Preview button for all issues
2. `src/components/admin/ScoringFixImpactDialog.tsx` — Add `readOnly` mode
3. `src/components/admin/AdminKpiEditDialog.tsx` — Widen dialog to `max-w-5xl`


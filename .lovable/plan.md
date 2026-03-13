

# Scoring Health Check — Impact Preview & KPI Editor Integration

## Overview

Two enhancements to the Scoring Health Check tool:

1. **Impact Preview Before Fix**: Before applying any fix (e.g., flipping criteria), show the admin exactly which months are affected, what the current scores are, and what the new scores will be after the fix. Let the admin select which months to apply the fix to.

2. **Inline KPI Editor**: Add an "Edit" button on each issue row that opens the existing `AdminKpiEditDialog` for that KPI, so admins can manually adjust any field without leaving the Health Check.

---

## Detailed Design

### 1. Impact Preview Dialog

When the admin clicks "Fix" on an issue (e.g., inverted criteria), instead of immediately applying the fix, a confirmation dialog opens showing:

**Header**: KPI name, employee name, issue type

**Impact Table** (one row per fiscal month):

```text
┌──────────┬──────┬─────────────┬──────────────┬──────────────┬────────┐
│  Month   │ Year │ Achieved    │ Current      │ Simulated    │ Apply? │
│          │      │ Value       │ Score/Rating │ Score/Rating │   ☐    │
├──────────┼──────┼─────────────┼──────────────┼──────────────┼────────┤
│ January  │ 2026 │ 2           │ 5 (Excellent)│ 2 (Poor)     │   ☑    │
│ February │ 2026 │ —           │ —            │ —            │   ☑    │
│ December │ 2025 │ 1           │ 4 (Good)     │ 3 (Average)  │   ☑    │
└──────────┴──────┴─────────────┴──────────────┴──────────────┴────────┘
```

- **Current Score**: Fetched from `review_submissions` for each sibling KPI
- **Simulated Score**: Recalculated using `calculateRating()` with the corrected criteria (or other fix)
- Score changes are color-coded: green for improvement, red for decrease, grey for unchanged
- **Month checkboxes**: All checked by default. Admin can uncheck months to exclude them from the fix.
- Months with no submission data show "—" and are still selectable (structural fix only, no score impact)

**Summary line**: "This will change scores for X of Y months. Z scores will decrease."

**Buttons**: "Cancel" | "Apply Fix to Selected Months"

**Flow**:
1. Admin clicks "Fix" → dialog opens, fetches all fiscal siblings + their submissions
2. Runs `calculateRating()` client-side with the new criteria for each sibling that has an achieved value
3. Admin reviews impact, toggles months on/off
4. Clicks "Apply" → updates only the selected KPI IDs + logs audit entry

### 2. KPI Editor Button

Each issue row in the Health Check gets a small "Edit" (Pencil icon) button next to the existing "Fix" button. Clicking it:
- Opens the existing `AdminKpiEditDialog` with that KPI pre-loaded
- On close, the Health Check re-evaluates issues (already happens via query invalidation)

This gives admins full control for issues that can't be auto-fixed (missing thresholds, missing qualitative options, missing target).

### 3. "Fix All" with Impact Preview

The "Fix All" button for a category will show an aggregated impact summary:
- Total KPIs affected, total months, total score changes (up/down/unchanged)
- A condensed table grouped by employee
- All months selected by default, but admin can deselect individual employees
- Applies fixes only to selected employees/months

---

## Files

### New File
**`src/components/admin/ScoringFixImpactDialog.tsx`**
- Accepts: the `ScoringIssue` (or array for bulk), fix type
- Fetches fiscal siblings via `supabase.from('kpis')` query (reusing existing logic from `getFiscalSiblingIds` but returning full KPI data)
- Fetches `review_submissions` for all sibling KPI IDs
- Runs `calculateRating()` from `@/lib/ratingCalculation` to simulate new scores
- Renders the impact table with month checkboxes
- On confirm: applies the fix to selected KPI IDs only, writes audit log, invalidates queries

### Modified Files

**`src/components/admin/ScoringHealthCheck.tsx`**
- Import `ScoringFixImpactDialog` and `AdminKpiEditDialog`
- Replace direct `fixInvertedCriteria` / `fixMissingCriteria` calls with opening the impact dialog
- Add state: `impactIssue` (single issue for preview), `editKpi` (KPI for editor), `bulkImpactIssues` (array for Fix All)
- Add "Edit" (Pencil) button to each issue row alongside "Fix"
- Wire "Fix All" to open bulk impact dialog

---

## Technical Notes

- `calculateRating` is already imported and used in `useOrgKpiImpact.ts` — same pattern reused here
- The `AdminKpiEditDialog` already accepts a `KPI` object — no changes needed to that component
- Fiscal sibling resolution reuses the same July-June logic already in `ScoringHealthCheck.tsx`
- Score simulation is client-side only — no DB writes until admin confirms
- The impact dialog fetches submissions with a single `.in('kpi_id', ids)` query — lightweight


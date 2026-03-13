
# CAPA: Reusable Admin KPI Editor + AllKpis Page Realignment — IMPLEMENTED ✅

## Changes Made

### 1. Reusable Admin KPI Editor
- **Created `src/components/admin/AdminKpiEditorForm.tsx`**: Extracted all form state, handlers (handleSubmit, handleCopyToMonths), and JSX from AdminKpiEditDialog into a standalone reusable component. Props: `kpi`, `onSaved`, `onCancel`. No Dialog/Sheet wrapper — pure form content.
- **Refactored `src/components/admin/AdminKpiEditDialog.tsx`**: Slimmed to a thin Dialog shell (~30 lines) that renders `<AdminKpiEditorForm />` inside DialogContent. Same external interface preserved for all 4 consumers.

### 2. AllKpis Page Realignment (`src/pages/admin/AllKpis.tsx`)
- **Header**: Split into two rows — title + primary CTA (Assign KRA) on top, secondary toolbar (Scoring Health, Export, Copy KRAs, Bulk Assign) on second row with visual separator
- **Filters**: Replaced Card wrapper with compact inline bar, added active filter count badge, smaller trigger heights (h-9)
- **Table**: Added sticky left column for Employee Name, tightened stage column padding, shortened header labels (Total, Org)
- **Expanded KPI rows**: 2-column grid layout (info left, actions right), icon-only buttons (h-8 w-8) with tooltips, line-clamp on KPI name, truncated metadata

## Impact
- No schema changes, no RLS changes
- AdminKpiEditorForm is now embeddable in Dialog, Sheet, or full-page contexts
- All existing consumers unchanged (same AdminKpiEditDialog interface)



## Make KPI Name Fully Visible in Admin KPI Editor

### Problem
The KPI Name textarea uses `rows={1}` and `min-h-[36px]`, so long KPI names (with formulas, scoring logic) are truncated to a single line. The user must manually resize to see the full content.

### Fix — `src/components/admin/AdminKpiEditorForm.tsx` (line 453-454)

Change the textarea from `rows={1}` with small min-height to `rows={3}` with a taller min-height so multiline KPI names are visible by default:

- `rows={1}` → `rows={3}`
- `min-h-[36px]` → `min-h-[80px]`
- Keep `resize-y` so admin can still adjust

### Risk Assessment
- **Data Impact**: None
- **Workflow Impact**: None
- **Regression Risk**: Zero — cosmetic change only

### Files Changed
1. **`src/components/admin/AdminKpiEditorForm.tsx`** — Increase KPI Name textarea rows and min-height


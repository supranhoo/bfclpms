# Fix horizontal scrolling in Admin KPI Editor

The screenshot is the **Admin KPI Editor** dialog (a different surface from the "Assign New KRA" dialog fixed earlier), so it never received the overflow fix. It still grows wider than the viewport and forces a horizontal scrollbar.

## What's wrong (verified in code)

1. `AdminKpiEditDialog.tsx` uses `max-w-5xl` (1024px) with no viewport-relative cap — wider than the ~994px preview viewport.
2. In `KpiTextSplitFields.tsx`, the collapsed legacy-text preview uses `truncate` inside a flex row but has no `min-w-0`, so the very long legacy KPI string cannot shrink and pushes the dialog wide.
3. `AdminKpiEditorForm.tsx` uses fixed `grid-cols-2` / `grid-cols-3` at every width with no `min-w-0` on columns, so long labels/inputs expand the track instead of wrapping.

## Changes

**src/components/admin/AdminKpiEditDialog.tsx**
- `w-[96vw] max-w-[1200px] max-h-[92vh]` with `overflow-x-hidden`, body scrolls vertically only (same pattern already proven on Assign New KRA).

**src/components/admin/kpi-form/KpiTextSplitFields.tsx**
- Add `min-w-0` to the trigger button and the preview span so the truncated legacy text shrinks instead of stretching.

**src/components/admin/AdminKpiEditorForm.tsx**
- Make the grids responsive (`grid-cols-1 sm:grid-cols-2`, `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`) and add `min-w-0` to grid containers and field wrappers.
- Replace fixed widths `w-[220px]` / `w-[140px]` on selects with `w-full sm:w-[220px]` / `w-full sm:w-[140px]`.

No functional, validation, or data changes — layout only. Every field, section and control stays exactly where it is in reading order.

## Verification

- Typecheck + build.
- Existing `kpiTextSplit` / `kpiTextDisplay` tests must stay green.
- Manual check at 1280px, 994px and 375px widths: no horizontal scrollbar, all fields reachable.

## Docs

- `DOCUMENTATION.md` version bump and a short ADR-306 note extending the ADR-304 viewport-containment rule to the Admin KPI Editor. No POLICY change (presentation only).

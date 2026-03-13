

# Plan: Fix Build Errors + KPI Weightage Dashboard Improvements

## 1. Fix Build Errors (dependency mismatch)

The errors (`Property 'getUser' does not exist`, `Module has no exported member 'User'`, `vite: command not found`) are all caused by **corrupted or missing `node_modules`** — the installed `@supabase/supabase-js` types don't match the runtime API. This affects ~20 files but is a single root cause.

**Fix**: Force reinstall dependencies. No code changes needed for these errors.

## 2. KPI Column Width — Fit Table Within Page

Currently the KRA/KPI column has `min-w-[250px]` and each month column has `min-w-[70px]`. With 12 months this forces horizontal scroll.

**Changes in `KpiWeightageDashboard.tsx`**:
- Change KRA/KPI column from `min-w-[250px]` to `max-w-[200px]` with `truncate` overflow
- Change month columns from `min-w-[70px]` to `min-w-[55px]` 
- Add `table-fixed` layout to constrain columns within viewport
- Wrap the table container with `w-full` to prevent overflow beyond the page

## 3. Edit KPI — Already Integrated, Make More Discoverable

The `AdminKpiEditDialog` is already wired up and works identically to the AllKpis page. The Settings2 icon only appears on hover which may make it hard to discover.

**Changes in `KpiWeightageDashboard.tsx`**:
- Change the edit icon from hover-only (`opacity-0 group-hover:opacity-100`) to always-visible but subtle (`opacity-50 hover:opacity-100`)
- Use the `Edit` (pencil) icon instead of `Settings2` to match the AllKpis page visual language

## Files Modified
1. `src/pages/admin/KpiWeightageDashboard.tsx` — table width constraints + edit icon visibility

No database changes needed.


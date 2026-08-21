# Fix Assign New KRA: remove horizontal scrolling

## What went wrong
The dialog was set to `w-screen h-screen` with a centered transform. `100vw` includes the vertical scrollbar width, and the centered dialog is offset from the viewport, so the panel is wider than the usable area — hence the horizontal scrollbar. Grid columns without `min-w-0` also let long labels and inputs push the layout wider than its container.

## The fix (presentation only)

1. **Contained wide modal instead of viewport-width overlay**
   `DialogContent` becomes `w-[96vw] max-w-[1200px] max-h-[92vh] p-0 gap-0 flex flex-col overflow-hidden` — wide and roomy, but never wider than the viewport, so no horizontal scrollbar. Sticky header and footer are kept; the body stays `flex-1 overflow-y-auto`.

2. **Kill overflow sources inside the body**
   - Drop the `max-w-7xl` inner wrapper (now redundant) and add `min-w-0` to the body wrapper.
   - Add `min-w-0` to both grid columns and to the inner `grid-cols-2` blocks so children shrink instead of pushing.
   - Long single-line values (KPI names, employee names, badges) get `truncate` / `break-words` where they currently sit on one line.

3. **Responsive columns**
   Two columns split at `lg` (not `xl`) so the wider modal actually uses both columns; single column below that.

4. **Keep everything else unchanged**
   All fields, tooltips, badges, scoring editors, the collapsible legacy free-text row, validation and the create payload stay exactly as they are.

## Verification
- Open Assign New KRA from Dashboard, Admin -> All KPIs, and the KRA Issuance dialog; confirm no horizontal scrollbar at 1280px and at 1024px.
- Confirm every section (Assignment, KRA Identity, Metrics & Configuration, Scoring, Advanced) renders and a KPI can be created end to end.
- Run the existing KPI form/text tests.

## Files touched
- `src/components/admin/AdminKpiCreateDialog.tsx`
- `docs/adr/ADR-304.md` (amend: full-screen replaced by contained wide modal), DOCUMENTATION.md version note.

## Rollback
Single component file revert; no schema, RPC or policy dependency.

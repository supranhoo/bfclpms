
## Widen the inline "Code" editor in Organization Structure tabs

### What the user sees (verified from screenshot)
On the Designations tab (and same pattern on Divisions, Business Units, Departments, Sub-Branches, Locations, PMS Grades, Levels), clicking the pencil on the **Code** column opens a tiny inline `<Input>` that truncates the value — e.g. `"...r Operator"` instead of the full code. There is plenty of empty horizontal space on both sides of the column.

### Root cause
The inline edit input inherits a narrow fixed width (likely `w-24` / `w-32` or the column's natural width) from the row template. The surrounding `<TableCell>` for the Code column is also constrained, so even widening the input alone wouldn't help — the cell needs to expand while editing.

### Fix (UI-only, per-tab)
For every Org Structure tab component that supports inline edit of `code` / `name`:

1. **Inline input** — drop the fixed width; use `w-full min-w-[260px]` so the field fills the cell and never collapses below a readable size.
2. **Cell during edit** — add `whitespace-nowrap` and let it grow: `className="min-w-[280px]"` on the editing `<TableCell>`.
3. **Row layout** — keep the action buttons (✓ / ✗) inline to the right with `flex items-center gap-2 w-full`, so the input takes all remaining space.
4. **Name column** — apply the same treatment (`min-w-[320px]`) since long designations like "1st Class Boiler Operator" also clip.
5. **Tooltip on hover** — when not editing, show the full value via `title={code}` so users can read truncated values without entering edit mode.

No schema, RLS, or business-logic change.

### Files Touched
- `src/components/admin/DesignationsTab.tsx`
- `src/components/admin/DivisionsTab.tsx`
- `src/components/admin/BusinessUnitsTab.tsx`
- `src/components/admin/DepartmentsTab.tsx`
- `src/components/admin/SubBranchesTab.tsx`
- `src/components/admin/LocationsTab.tsx`
- `src/components/admin/PmsGradesTab.tsx`
- `src/components/admin/LevelsTab.tsx`

(Exact filenames will be confirmed at edit time; the same width fix is applied wherever an inline edit input exists.)

### Risk & Impact
| Area | Impact |
|---|---|
| Data | None. Pure CSS / layout change. |
| Workflow | None. |
| UI/UX | Code & Name inline editors expand to show the full value. Table remains responsive (overflow-x-auto on the wrapper already in place). |
| Regression | Very low. Width-only changes; no logic touched. |
| Mitigation | Verified against existing `min-w` usage in tabs; falls back to horizontal scroll on narrow viewports. |

### Out of Scope
- Switching inline edit to a modal dialog.
- Restructuring the table columns.
- Changing the save / cancel button placement beyond minor flex alignment.

## Goal
Add a "Reporting Manager" filter to the User Management page (`/admin/users`) so admins can narrow the user list to direct reports of a specific manager.

## Risk & Impact
- Data: none — frontend-only filter over already-loaded `profiles`.
- Workflow / RLS: unchanged.
- UI: one extra dropdown in the existing filter row.
- Regression: low — additive `matchesManager` clause in the existing `filteredProfiles` memo.
- Scalability: manager list is derived from in-memory `profiles` (already used for the Reporting To column), so no extra fetch.

## UI Change
Location: `src/pages/admin/UserManagement.tsx`, the filter row above "All Users" table.

After the existing **Employee Type** dropdown, add a searchable **Reporting Manager** combobox (`OrgFilterCombobox`, ~200px wide, placeholder "Reporting Manager"):
- Options: every active profile that is referenced as `reporting_manager_id` by at least one other profile, labeled `Full Name (employee_code)` and sorted alphabetically.
- Includes an "All Managers" default and a "— No Manager —" option (matches rows where `reporting_manager_id IS NULL`).
- Selecting a value filters the table to that manager's direct reports; clears via the combobox's built-in clear.
- Selection is also surfaced in the "Showing X of Y users" count and resets pagination via the existing `handleFilterChange()`.

Responsiveness: dropdown sits inline on desktop and wraps onto the next row on narrow widths (existing `flex flex-wrap` already handles this).

## Implementation Steps
1. **State** — add `const [managerFilter, setManagerFilter] = useState<string>('all');` next to the other filter states.
2. **Options memo** — derive `managerOptions` from `profiles`: collect distinct `reporting_manager_id` values, map to the matching active profile, sort by name; memo keyed on `profiles`.
3. **Filter logic** — in `filteredProfiles`, add:
   - `const matchesManager = managerFilter === 'all' || (managerFilter === 'none' ? !p.reporting_manager_id : p.reporting_manager_id === managerFilter);`
   - include it in the final `return` and add `managerFilter` to the dependency array.
4. **UI** — render a new `OrgFilterCombobox` (already imported elsewhere in the project — import from `@/components/admin/OrgFilterCombobox`) immediately after the Employee Type select, wired to `managerFilter` with `handleFilterChange()`.
5. **No backend / RLS / migration changes.**

## Tests
Add `src/test/userManagement/managerFilter.test.tsx`:
- Renders the filter, selecting a manager shows only that manager's direct reports.
- "— No Manager —" shows only profiles where `reporting_manager_id` is null.
- "All Managers" restores the full list.
Mock data: 4 profiles (2 reporting to M1, 1 to M2, 1 unmanaged).

## Docs
- `DOCUMENTATION.md` → User Management filter list: add "Reporting Manager".
- `POLICY.md` → no change (purely a view filter, no new access rules).

## Not Applicable
Schema, RLS, edge functions, backups, rollback (pure UI addition; revertible by removing the state, memo and JSX block).
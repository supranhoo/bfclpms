# Department list not findable in Add/Edit User — RCA & fix

## What was verified (not assumed)

- The data is present: 100 departments exist; 53 of them sit under the **Support Function** division shown in the screenshot. So this is not missing master data.
- Department names are **not unique**: `Admin-Admin` appears twice and `Commercial-HO` appears twice under Support Function (different Business Units: `Admin` vs `Admin`, `Commercial-HO` vs `Commercial`). The two names visible in the screenshot are exactly the duplicated ones.
- `OrgFilterCombobox` (single-select mode) renders `<CommandItem value={option.label}>` — cmdk keys and de-duplicates items by that `value`. Duplicate labels collide.
- The same component computes `filteredOptions` from its own `search` state but never uses it in single-select mode, and `CommandInput` is uncontrolled — search relies entirely on cmdk's internal filter over the colliding label values.
- The dropdown list has no explicit height/scroll cap of its own; it renders inside a scrollable dialog.

Not yet confirmed: whether the visible list is truly 2 items or a clipped/scroll-stuck list. Step 1 below confirms it before the fix lands.

## Risk & impact

- Data: none. No schema change, no migration; departments master data untouched.
- Workflow: none. Only the picker's rendering/search behaviour changes.
- UI/UX: Add User and Edit User dialogs, plus every other screen using `OrgFilterCombobox` (Access Control, Access Profiles, Employee Filters) get a correctly scrolling, correctly searchable list.
- Regression risk: low-moderate — the combobox is shared. Mitigated by keeping the public props identical and adding unit tests.
- Scalability: list stays client-side (100 departments, ~2.7k employees are unaffected), with a virtual-free capped-height scroll area.
- Rollback: revert the component + page changes; purely presentational.

## Plan

1. **Confirm the failure mode** — drive the Add User dialog in a headless browser, open the Department picker, and count rendered options plus popover height. This decides whether the cause is item collision, clipping, or both.
2. **Fix `OrgFilterCombobox` single-select rendering**
   - Give each `CommandItem` a collision-proof cmdk value (`${label}__${option.value}`) so duplicate department names can no longer swallow each other.
   - Control the search input (`value={search}` / `onValueChange={setSearch}`) and render `filteredOptions` — removing the dead code path and making search deterministic.
   - Add an explicit scroll container (`CommandList` capped height) and constrain the popover to the available viewport height so the list can never be clipped inside a scrolling dialog.
   - Show a small "N options" hint / `emptyMessage` so an empty result is distinguishable from a clipped list.
3. **Disambiguate department labels** in User Management: render `Department — Business Unit` when a department name is duplicated within the current option set, so admins can tell the two `Admin-Admin` entries apart. Derived at render time from data already loaded — no hardcoded names.
4. **Keep division filtering intact**: the create/edit dialogs still narrow departments by the selected Division; departments with no Business Unit stay reachable when no division is selected (there is 1 such row).
5. **Tests**: unit tests for the combobox (duplicate labels both render and are independently selectable; search filters by substring; empty state message) and for the department label disambiguation helper.
6. **Docs**: ADR-251 (Org picker option-identity and scroll integrity) in `docs/adr/`, `DOCUMENTATION.md` section update, and `POLICY.md` §ORG-PICKER-OPTION-IDENTITY — every option list must use a unique identity value and a bounded scroll region.

## UI changes

- Add User / Edit User → Organization → **Department**: dropdown becomes a bounded, scrollable list showing all departments for the chosen division; duplicated names are suffixed with their Business Unit; typing filters the full list.
- Same improvements apply anywhere `OrgFilterCombobox` is used (filters on review/access screens).
- No change to review, scoring, report or dashboard surfaces.

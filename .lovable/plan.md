

## Plan — Replace Copy KRAs Source/Target Employee Pickers with Click-to-Search Combobox

### Problem

In the Copy KRAs dialog, the **Source Employee** picker is a plain text input. Typing an employee code (e.g. `101784`) shows no dropdown until you re-focus, and even then matches are inconsistent. The user wants an obvious **click-to-search** trigger button (matching the rest of the app's pattern, e.g. `ManagerCombobox`) so users can browse/search employees comfortably.

### Fix — Adopt the App-Standard Combobox Pattern

Reuse the existing `Popover + Command` recipe (already used in `ManagerCombobox`, `AdminKpiCreateDialog` category picker, `OrgFilterCombobox`) so the UX matches the rest of the admin suite per `mem://features/admin/user-management-manager-selection`.

#### Source Employee — Single-Select Combobox

Replace the current `<Input>` + inline list block with:

- A trigger `<Button variant="outline">` showing either the selected employee (`Name · Code · Department`) or placeholder "Click to search employee…" with a `ChevronsUpDown` icon on the right and `Search` icon on the left.
- On click → `<Popover>` opens a `<Command>` with:
  - `CommandInput` placeholder: "Search by name, code, or department…"
  - `CommandList` → `CommandGroup` rendering filtered employees (cap 50 visible, no slice on filter result count). Each `CommandItem` shows `Name`, `Code` badge, `Department` muted.
  - `CommandEmpty`: "No employees found."
  - Filter logic: case-insensitive match against `name`, `code`, **and** `department` (current code only matches name + code, missing department, and the inline search drops dropdown the moment the user clicks elsewhere — fixed by the popover).
- Selecting an employee closes the popover, sets `sourceEmployeeId`, and clears `selectedKraIds`.
- Show selected employee as a small badge with a "Change" link (preserve existing UX) below the trigger.

#### Target Employees — Multi-Select Combobox

The Target picker today uses an inline `<Input>` filter on a fixed 50-row list with checkboxes. It works but is inconsistent with the new Source picker. Apply the same pattern, **multi-select variant** (modeled on `multi-select-filter.tsx`):

- Trigger `<Button>`: "Click to select employees…" or `"{n} employee(s) selected"` with `ChevronsUpDown`.
- Popover `<Command shouldFilter={false}>`:
  - `CommandInput` for search across name/code/department.
  - "Select all (filtered)" `CommandItem` at top.
  - Each `CommandItem` shows checkbox + name + code badge + department + duplicate-count badge (`{n} dup`) when applicable.
  - Excludes the source employee.
- Below trigger: render selected employees as removable `<Badge>` chips (click `×` to deselect) — gives at-a-glance visibility of the multi-select set.
- Keep the existing duplicate-detection + amber alert intact.

#### Component Extraction (Optional but Recommended)

Create a thin **`EmployeeCombobox`** component in `src/components/admin/EmployeeCombobox.tsx` accepting:
```ts
{ employees, value, onChange, multiple?, excludeIds?, placeholder?, duplicateCounts? }
```
so the same picker can be reused later (e.g. in Bulk Assign, Smart Assignment). Single-select returns `string`; multi-select returns `string[]`. Keeps Copy KRAs dialog lean (Engineering Excellence — separation of concerns).

### Files Changed

1. **New: `src/components/admin/EmployeeCombobox.tsx`** — reusable click-to-search picker (single + multi modes), uses `Popover` + `Command` per app standard.
2. **`src/components/admin/CopyKrasDialog.tsx`**:
   - Remove the raw `<Input>`-based source search and inline employee list.
   - Remove the raw target `<Input>` filter and the static checkbox list.
   - Replace both with `<EmployeeCombobox>` instances (single for source, multi for target).
   - Drop the now-unused `sourceSearch` / `targetSearch` / `filteredSourceEmployees` / `filteredTargetEmployees` state.
   - Keep all KRA-selection, duplicate-detection, and copy-mutation logic untouched.
3. **`DOCUMENTATION.md` v2.66.7.8** — note the standardized employee-picker UX in admin tools.
4. **`mem://features/admin/copy-kras-org-kpi-integrity`** — append: "Source/target employee pickers use the shared `EmployeeCombobox` (click-to-search Popover + Command), matching `ManagerCombobox` UX."

### Risk & Impact Report

- **Data Impact**: None. UI-only change; mutation payload unchanged.
- **Workflow Impact**: None. Same fields, same copy semantics, same RLS path.
- **UI/UX**: Significantly clearer affordance ("Click to search" trigger) and consistent with `ManagerCombobox`. Multi-select chips improve visibility of the target set. Resolves the reported "not showing employee" issue (the popover stays open while the user types, and filters across name/code/department).
- **Regression Risk**: Low. Confined to the Copy KRAs dialog; no shared hooks or queries modified. The new `EmployeeCombobox` is additive.
- **Mitigation**: Visual smoke-test the dialog: (a) source search by code `101784` → match shows; (b) source by partial name; (c) multi-target select + duplicate badges; (d) clear/change source resets KRAs.

### Out of Scope

- Replacing employee pickers elsewhere (Smart Assignment, Bulk Assign) — deferred follow-up sweep.
- Server-side pagination for >5,000 employees — current dataset (≤200) renders comfortably.
- Keyboard-only flow tests beyond what `cmdk` provides natively.

### Deliverables

- `EmployeeCombobox.tsx` (new, single + multi modes).
- Patched `CopyKrasDialog.tsx` using the new combobox for both source and target pickers.
- DOCUMENTATION.md v2.66.7.8 + memory append.


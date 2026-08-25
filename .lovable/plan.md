# Fix: Create PIP screen asks for the employee again

## What happens today

Starting a PIP from a suggestion or from the Monthly Trend grid already carries the employee
(`/admin/pip/new?employee=<id>&trigger=…`). The Create PIP page still shows an empty
"Employee" dropdown, with the helper line "Prefilled from a PIP suggestion" underneath —
so the field is technically prefilled but visually blank, and the user is forced to pick again.

## Root cause

The employee control is a plain `<Select>` whose trigger renders a custom
`<SelectValue>` child derived from a separately fetched employee list.
Until (or unless) that list resolves and contains the preselected id, the trigger renders
nothing at all — not even the placeholder. So the id is in the form state, but the field
looks empty. If the preselected employee is missing from the fetched list, it stays blank
forever and submitting still works with an invisible selection — confusing and error-prone.

## Fix

1. When an employee arrives via the URL, render a confirmed employee card instead of a
   dropdown: name, employee code, designation, department, plus a "Change employee" button
   that reveals the picker. No re-selection needed in the normal flow.
2. Resolve the preselected employee by id directly (single lookup), independent of the
   bulk list, so the card renders on first paint even before the list loads.
3. Replace the raw `<Select>` with the existing searchable employee combobox pattern used
   elsewhere (search by name / employee code / email) for the manual "no prefill" case and
   for "Change employee".
4. Show a skeleton while the preselected employee is resolving, and a clear inline
   `text-destructive` message if the id cannot be resolved (inactive or not visible),
   instead of a silently blank field.
5. Keep the existing warning that changing the employee also changes who the recorded
   trigger evidence applies to — shown when the user actually opens the picker.

## Technical notes

- File: `src/components/pip/PIPCreateForm.tsx` (presentation only).
- Add a `useQuery(['pip-employee', id])` single-row profile fetch for the preselected id;
  keep the existing `employees-for-pip` list only for the picker.
- Reuse `EmployeePickerCombobox` (`src/components/reviewNotes/EmployeePickerCombobox.tsx`)
  rather than adding a new picker.
- No schema, RLS, validation or submit-payload changes; `employee_id` stays the same field
  with the same zod rule.

## Tests

- Unit test: given `preselectedEmployeeId`, the form renders the employee card and no
  dropdown, and `employee_id` is set in form state.
- Unit test: with no prefill, the picker renders and selecting a person sets `employee_id`.
- Unit test: unresolvable preselected id renders the inline error, not a blank control.

## Risk & impact

- Data: none. Workflow: none — same payload, same POLICY §15.7 overlap guard.
- UI: the "Employee" field on `/admin/pip/new` only.
- Regression risk: low; change is confined to one card in one form.
- Rollback: revert the single component change.
- Docs: DOCUMENTATION.md version note + ADR entry for the prefill-confirmation pattern.

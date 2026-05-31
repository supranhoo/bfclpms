## Goal
Add manual Add/Edit + employee search to **Increment Inputs → Enter Inputs**, alongside the existing Excel import. No schema, calculation, permission, or AY logic changes.

## Risk & Impact
- **Data**: Reuses `useUpsertIncrementInput` (already upserts on `employee_id + assessment_year`) — no duplicate risk, no schema change.
- **Workflow**: Calculate Increment % tab unaffected (reads same `increment_inputs` table).
- **UI**: Adds button + dialog + search box; existing layout, columns, pagination preserved.
- **Regression risk**: Low; isolated to one page + one hook (search filter).
- **Mitigation**: Reuse battle-tested `EmployeeCombobox` + `useProfiles()` (already paged-safe per Profiles Query Policy).

## Changes

### 1. `src/hooks/useIncrementInputs.ts` — make `search` actually filter
- When `search` is non-empty, switch the joined select to **inner** join: `employee:profiles!increment_inputs_employee_id_fkey!inner(...)` and add `.or('full_name.ilike.%term%,employee_code.ilike.%term%', { foreignTable: 'employee' })`.
- Server-side filter → pagination naturally reflects filtered count.
- No behavior change when `search` is empty.

### 2. New component `src/components/incentive/IncrementInputDialog.tsx`
Reusable Add/Edit dialog:
- Props: `open`, `onOpenChange`, `assessmentYear`, `existing?: IncrementInputRow` (edit mode when present), `employees: EmployeeOption[]`.
- **Add mode**: `EmployeeCombobox` (single-select) at top + numeric inputs.
- **Edit mode**: employee shown as read-only label "Name (Code)" + AY badge; combobox hidden.
- Fields: Absent Days, LWP Days, Disciplinary Actions, Training Compliance (default `0`); Current Salary (nullable); Remarks (Textarea).
- Zod validation: employee required, all numerics `>= 0`, salary nullable `>= 0`.
- On submit → `useUpsertIncrementInput.mutateAsync({ employee_id, assessment_year, ...fields, source: 'manual', remarks })`.
- If add mode and an existing row matches the chosen employee + AY (looked up via current `data.rows` or quick lookup), show an inline warning "Existing entry will be updated" before save.

### 3. `src/pages/incentive/IncrementInputs.tsx` (EnterInputsTab)
- Add state: `search`, `dialogOpen`, `editingRow`.
- Add **"Add Input"** primary button next to Template / Import Inputs.
- Add search `Input` above the table (debounced ~300ms) → passed to `useIncrementInputs(year, page, pageSize, debouncedSearch)`; reset `page` to 0 when search changes.
- Load employees via `useProfiles()` (filtered `is_active !== false`, mapped to `EmployeeOption`).
- Add **Actions** column with Edit button per row → opens dialog in edit mode pre-filled.
- Add **Remarks** and **Last Updated** columns (existing fields).
- Update empty state to: *"No inputs yet. Add employee inputs manually or import an Excel file to begin."*
- On dialog save → query invalidation already handled by hook; toast already shown.

## Out of Scope
- Schema changes, delete action, bulk manual edit, history/audit UI changes.
- Calculate Increment % tab.

## Tests (manual verification path)
1. Add Input for fresh employee → row appears, source = `manual`.
2. Add Input for employee with existing row → warning shown; on save, same row updated (no duplicate; verify via search).
3. Edit imported row → values update; source label retained.
4. Search by name + by code → filters table; pagination count matches.
5. Negative numbers / empty employee → blocked with toast.
6. Excel import still works end-to-end.

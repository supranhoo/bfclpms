
## Plan — Fix missing “Vivek (101784)” in Copy KRAs employee picker

### Root Cause

This is not a search-popover bug. The employee exists and is active, but the dialog never loads him into the client-side list.

Confirmed findings:
- Employee `101784` exists as **Vivek Kumar Dansena** and is active.
- In the full employee ordering, he appears around row **2512**.
- `CopyKrasDialog` currently fetches employees with:
  - `supabase.from('profiles').select(...).order('full_name')`
  - no `.range(...)`
  - no batched helper
- Backend reads are capped at **1000 rows by default**, so the combobox only receives the first page of employees.
- `EmployeeCombobox` searches only within the already-loaded `employees` array, so row 2512 will always show “No employees found.”

### Fix

Load the full active employee dataset for the Copy KRAs dialog using the project’s existing paged-fetch utility.

### Files to update

1. **`src/components/admin/CopyKrasDialog.tsx`**
   - Replace the current one-shot `profiles` query with `fetchAllPaged(...)`.
   - Add `eq('is_active', true)` to respect project rules and avoid showing inactive employees.
   - Keep ordering by `full_name`.
   - Continue mapping to:
     - `id`
     - `name`
     - `code`
     - `department`

2. **Optional small extraction for cleanliness**
   - Either:
     - keep the paged query inside the dialog, following existing local patterns, or
     - extract a tiny hook/helper like `useCopyKraEmployees()` so UI stays lean.
   - No behavior change beyond complete employee loading.

3. **`DOCUMENTATION.md`**
   - Add a note that Copy KRAs employee pickers use paged employee loading to avoid the 1000-row cap.
   - Append version history entry.

4. **`POLICY.md`**
   - Add/update the policy note that admin employee selectors must use full batched loading or server-side search for large profile datasets, and must exclude inactive users.

5. **Tests / mocks**
   - Add a regression test for the employee loader/search behavior:
     - seed/mock >1000 employees
     - place the target employee after row 1000
     - verify the source picker can still find employee code `101784`
   - Update mock employee dataset to include a large-list scenario.

### Technical implementation detail

Use the existing helper:
- `src/lib/fetchAll.ts`

Target fetch shape:
```ts
const data = await fetchAllPaged<any>((from, to) =>
  supabase
    .from('profiles')
    .select('id, full_name, employee_code, departments:department_id(name)')
    .eq('is_active', true)
    .order('full_name')
    .range(from, to)
);
```

### Risk & Impact Report

- **Data Impact**: None. Read-only query change.
- **Workflow Impact**: Low. Employee pickers will finally include all active employees, including records beyond the first 1000.
- **UI/UX Consistency**: Improves correctness without changing the combobox interaction.
- **Regression Risk**: Low. The only notable effect is a larger in-memory employee list for this dialog.
- **Mitigation Plan**:
  - Use existing `fetchAllPaged` utility already adopted elsewhere in the app.
  - Keep query enabled only when the dialog is open.
  - Add regression test for >1000 employee datasets.

### Expected result after fix

Searching the Copy KRAs source picker for:
- `Vivek`
- `101784`
- or his department

will return **Vivek Kumar Dansena** instead of “No employees found.”

### Deliverables

- Patched `CopyKrasDialog.tsx` to use paged active-employee loading
- Regression test covering employees beyond row 1000
- Updated mock data for large employee lists
- `DOCUMENTATION.md` + `POLICY.md` sync entry

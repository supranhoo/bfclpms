## Goal

In the "View KPIs" drill-in table (`AffectedKpisTable`), enrich the **Employee** column to show the employee code and add a new **Department** column. Both columns get the existing Excel-style filter popover.

## Changes

### 1. `src/components/admin/kpi-standardization/AffectedKpisTable.tsx`

**a. Profile fetch — extend select**
- Change the profiles query from `select('id, full_name')` to `select('id, full_name, employee_code, department_id, departments(name)')`.
- Store `{ name, code, department }` per employee id in the `employees` map (instead of just `{ name }`).

**b. Enriched rows — add fields**
- `employee` cell display becomes `"Full Name (EMP123)"` when employee_code exists, else just the name (fallback to `id.slice(0,8)` when name missing).
- Add `department: employees[r.employee_id]?.department ?? ''` to each enriched row.

**c. Filter key + distinct**
- Add `'department'` to the `FilterKey` union.
- Add `department: distinctValues(enriched, 'department')` to the `distinct` memo.

**d. Header & body**
- Insert a new **Department** `<th>` (with `ColumnFilterPopover`) right after the sticky **Employee** header.
- Insert a matching `<td>{r.department || '—'}</td>` after the sticky Employee cell.
- Bump the empty-state `colSpan` from `4`/`12` to `5`/`13` to account for the new column.

### 2. Out of scope
- No schema/RLS/backend changes — `profiles.department_id → departments.name` is already readable.
- No changes to filter logic (`affectedKpisFilters.ts`) — it is column-agnostic.
- No changes to existing filter popover, pagination, outlier highlighting, or scale toggle.
- No test changes required (filter utility tests remain valid; the change is purely additive presentation).

## Risk
Very low — read-only UI enrichment within a single component. Only the profile select widens by a few columns; if `departments` join returns null for an employee, the cell falls back to `—` and that employee simply shows blank in the Department column.

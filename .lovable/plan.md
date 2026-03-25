

## Limit Table Display to 20 & Add Employee Search

### Changes

**File: `src/pages/admin/AllKpis.tsx`**

1. **Reduce default visible count from 50 to 20** — Change `useState(50)` on line 66 to `useState(20)`, and update the reset logic on line 329 to also use 20.

2. **Add employee search filter** — Add a new `searchEmployee` state. Place a search input in the Filters section (the `rounded-lg border bg-card p-4` block) that filters by employee name or code. Apply the search filter to `employeeData` before slicing for display:
   ```
   const displayData = employeeData.filter(emp =>
     emp.employeeName.toLowerCase().includes(searchEmployee) ||
     emp.employeeCode.toLowerCase().includes(searchEmployee)
   );
   ```

3. **Update the table rendering** to use `displayData` instead of `employeeData` for the row loop and the card description count.

4. **Include search in active filters count** and clear it in `resetFilters`.

### Layout
The search input will be added as a full-width row above the existing 5-column filter grid, with a `Search` icon and placeholder "Search employee by name or code...".


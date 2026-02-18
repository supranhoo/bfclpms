
# Enhancement: OrgKpiScopedEntryTable — Department, Designation, Wider Remarks, Department Sorting & Missing Improvements

## What the User Sees Today (Reference Image)
The scoped entry table (per-employee scope) shows:
- **Employee** column (name only, no department or designation)
- **Achieved** (narrow input)
- **Remark** (narrow single-line input)
- **File** (upload)

Rows are listed in raw DB order with no grouping or sorting.

---

## All Changes Planned

### 1. Add Department + Designation columns to the Employee scope table
For the **Employee** scope: show employee name with department and designation as sub-text below the name (two badge-style chips). This uses data already available in `allProfiles` (which has `designation` and `department_id`).

For the **Department** scope: add a "Employees" count badge next to the department name (e.g. "3 employees") using the existing `scopeSubText`.

### 2. Wider Remark field
Change the Remark `Input` to a `Textarea` (2 rows, auto-resize). The column will get more minimum width (`min-w-[200px]`).

### 3. Department-wise sorting
For **Employee** scope: sort rows by `department name` (A→Z), then by `employee name` within department. Group the rows visually by department with a subtle group header row.

For **Department** scope: sort rows by `department name` (A→Z).

### 4. Missing improvements identified
- **Sticky header**: The table header should stay visible while scrolling vertically through many employees.
- **Progress counter improvement**: Show "X / Y entered" in the collapsible trigger with color coding (green when all done).
- **"Enter all same" quick action**: A small helper to fill all empty Achieved values with a single value (bulk fill). Useful when all employees share the same org KPI value.
- **Out-of-range warning per row**: For employee-scope rows, show an inline alert if the entered value is outside the rating thresholds (same logic as the org-scope card currently has).

---

## Data Flow Changes

### `ScopedRow` interface (in `OrgKpiScopedEntryTable.tsx`)
Add two new optional fields:
```typescript
export interface ScopedRow {
  scopeId: string;
  scopeName: string;
  scopeSubText?: string;
  departmentName?: string;   // NEW — for grouping/sorting employee-scope rows
  designation?: string;       // NEW — for display in employee column
  achievedValue: number | null;
  remarks: string;
  evidenceUrl: string | null;
}
```

### `OrgKpiDataEntry.tsx` — `buildCardData` employee scope section
Currently builds `scopedRows` for employee scope like this:
```typescript
scopedRows = filteredEmps.map(emp => ({
  scopeId: emp.id,
  scopeName: emp.full_name || emp.email,
  achievedValue: ...,
  remarks: ...,
  evidenceUrl: ...,
}));
```

Needs to add `departmentName` and `designation` by looking up each employee's data from `allProfiles` and `departments`:
```typescript
scopedRows = filteredEmps.map(emp => {
  const dept = departments?.find(d => d.id === emp.department_id);
  return {
    scopeId: emp.id,
    scopeName: emp.full_name || emp.email,
    departmentName: dept?.name,         // NEW
    designation: emp.designation ?? undefined, // NEW
    achievedValue: ...,
    remarks: ...,
    evidenceUrl: ...,
  };
});
```

No schema changes needed. `departments` is already imported in `OrgKpiDataEntry.tsx`.

---

## UI Changes — `OrgKpiScopedEntryTable.tsx`

### Column layout (Employee scope)

| Column | Width | Content |
|---|---|---|
| Employee | `min-w-[200px]` | Name (bold) + Dept badge + Designation chip |
| Achieved | `w-28 text-center` | Number input |
| Remark | `min-w-[220px]` | `Textarea` (rows=2) |
| File | `w-28` | Upload |

### Department grouping rows (Employee scope only)
When `scopeLabel === 'Employee'` and rows have `departmentName`, sort rows by `departmentName` then `scopeName`, then render a subtle group header row before each new department:

```
┌─────────────────────────────────────────────────┐
│ 🏢 Operations (3 employees)          [group row] │
├──────────────┬──────────┬──────────────┬─────────┤
│ Jaspal Singh │  [----]  │ [remark box] │ Upload  │
│  Operations  │          │              │         │
│  Sr. Manager │          │              │         │
├──────────────┴──────────┴──────────────┴─────────┤
│ 🏢 Finance (2 employees)             [group row] │
├──────────────┬──────────┬──────────────┬─────────┤
│ Firoz Shaikh │  [----]  │ [remark box] │ Upload  │
...
```

Group header row style: `bg-muted/50 text-xs font-semibold text-muted-foreground` with a Building2 icon.

### Out-of-range warning
Pass `ratingThresholds` and `targetValue` down to the table as optional props. Each row shows a small orange warning triangle icon (with tooltip) if the entered value is outside range. This reuses the existing `isValueOutOfRange` utility from `@/lib/ratingCalculation`.

### Bulk fill
A small input + "Fill all empty" button in the table header area:
```
[    Enter value    ] [Fill empty rows]
```
Clicking "Fill empty rows" calls `onValueChange` for every row where `achievedValue === null`.

### Collapsible trigger enhancement
```
▼  27 Employees (5 / 27 entered)    [Fill All: [___] [Apply]]
```
When `enteredCount === rows.length`: trigger text turns green.

---

## Files to Modify

| File | Changes |
|---|---|
| `src/components/admin/OrgKpiScopedEntryTable.tsx` | Add `departmentName` + `designation` to `ScopedRow`; change `Input` → `Textarea` for remarks; add dept group header rows; wider remark column; sticky table header; bulk fill; out-of-range warnings per row |
| `src/pages/admin/OrgKpiDataEntry.tsx` | In `buildCardData` employee scope: add `departmentName` and `designation` from `departments` + `allProfiles`; sort employee-scope rows by dept name then emp name |
| `DOCUMENTATION.md` | Version bump to 1.45.10 |

---

## Technical Notes

- `allProfiles` is already fetched in `OrgKpiDataEntry.tsx` via `useProfiles()` — no extra query needed.
- `departments` is already fetched in `OrgKpiDataEntry.tsx` via `useDepartments()` — no extra query needed.
- `ScopedRow.departmentName` and `ScopedRow.designation` are optional — existing department-scope cards that don't populate them will continue to work unchanged (no breaking change to the interface).
- The `Textarea` for remarks uses `resize-none` and `rows={2}` to keep the table row height consistent while giving 2× the vertical space for text.
- The `isValueOutOfRange` check in per-row warnings requires `r5/r4/r3/r2/r1`, `targetValue`, and `uom` — these need to be passed as optional props to `OrgKpiScopedEntryTable`. They already exist on the `OrgKpiCardData` (and thus on the `OrgKpiEntryCard` which renders the table).
- Department-wise grouping only applies when `scopeLabel === 'Employee'`; for Department scope, alphabetical sorting only (no group headers).
- Sorting is done in-component (pure JS `.sort()`) — no DB changes.
- No RLS or migration changes needed.

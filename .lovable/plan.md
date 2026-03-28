

## Add Sorting to Avg Final Score, Emp Code, and Department Columns

### What You Asked For
Make "Avg Final Score", "Emp Code", and "Department" column headers clickable for ascending/descending sort — same pattern as the existing "Mgr Code" sort.

### Implementation

**File: `src/pages/reports/TeamVsManagerScoreReport.tsx`**

1. **Expand sort field type** from `'name' | 'mgrCode'` to `'name' | 'mgrCode' | 'empCode' | 'department' | 'avgScore'`

2. **Add sort cases** in the `rows` memo sort logic:
   - `empCode` → `a.employeeCode.localeCompare(b.employeeCode) * dir`
   - `department` → `a.department.localeCompare(b.department) * dir`
   - `avgScore` → numeric comparison with nulls sorted last: `(a.avgFinalScore ?? -Infinity) - (b.avgFinalScore ?? -Infinity) * dir`

3. **Make three column headers clickable** with the same pattern as Mgr Code:
   - "Emp Code" `<TableHead>` — clickable, toggles `empCode` sort
   - "Department" `<TableHead>` — clickable, toggles `department` sort
   - "Avg Final Score" `<TableHead>` — clickable, toggles `avgScore` sort
   - Each shows `ArrowUp`/`ArrowDown`/`ArrowUpDown` icon based on active state

4. **Helper function** — extract a reusable `renderSortableHeader(label, field)` to avoid duplicating the click handler + icon logic across 4 sortable columns.

5. **Update `DOCUMENTATION.md`** version history.

### Files Changed
| File | Action |
|------|--------|
| `src/pages/reports/TeamVsManagerScoreReport.tsx` | Expand sort type, add 3 sortable headers, extract helper |
| `DOCUMENTATION.md` | Version history entry |

### Risk Assessment
- **Regression**: Zero — additive UI-only change
- **Data**: No schema changes


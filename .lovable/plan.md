

## Add Manager Code Sorting to Team Vs Manager Report

### What You Asked For
Add a clickable sort toggle on the "Mgr Code" column header so rows can be sorted by reporting manager code ascending/descending.

### Implementation

**File: `src/pages/reports/TeamVsManagerScoreReport.tsx`**

1. Add sort state:
   ```ts
   const [sortField, setSortField] = useState<'name' | 'mgrCode'>('name');
   const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
   ```

2. Replace the hardcoded `.sort()` in the `rows` memo with a dynamic sort that respects `sortField`/`sortDir` — default sorts by employee name, toggleable to manager code.

3. Make the "Mgr Code" `<TableHead>` clickable with an `ArrowUpDown` icon that toggles sort direction when clicked. Use the same icon pattern already in `KpiSortControl`.

4. Update `DOCUMENTATION.md` version history.

### Files Changed
| File | Action |
|------|--------|
| `src/pages/reports/TeamVsManagerScoreReport.tsx` | Add sort state + clickable Mgr Code header |
| `DOCUMENTATION.md` | Version history entry |

### Risk Assessment
- **Regression**: Zero — additive UI-only change
- **Data**: No schema changes


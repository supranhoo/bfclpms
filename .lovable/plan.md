

## Plan: Add Sortable Column Headers to KpiDetailsTable (All Dashboards)

### Scope

`KpiDetailsTable` is the **single shared component** used across all review dashboards — My KPIs, Team Review, Audit, Management, Skip-Level, and HR PMS. Adding sort capability here automatically enables it on **all dashboards**.

### What Changes

**File: `src/components/review/KpiDetailsTable.tsx`**

1. **Add local sort state** — `sortField` and `sortDirection` via `useState`
2. **Replace static `<TableHead>` with clickable headers** for: Category, Weightage, each score column (Self, Manager, HR PMS, Auditor, Mgmt — dynamically from `scoreColumns`), Final (last score column), and Status
3. **Sort `kpis` array via `useMemo`** before rendering:
   - **Category**: alphabetical by `kra_categories.name`
   - **Weightage**: numerical
   - **Score columns**: numerical by corresponding submission score from `submissionMap`, nulls last
   - **Status**: by canonical status order from `statusLabels`
4. **Arrow icons**: `ArrowUpDown` (inactive), `ArrowUp`/`ArrowDown` (active) from lucide-react
5. **Styling**: Active header gets `secondary` variant look; click toggles asc↔desc; clicking a different column defaults to desc

### Technical Detail

```text
Header row (before):
  Category | KRA/KPI | Target | Weightage | Achieved | [scores...] | Status | Actions

Header row (after):
  Category ↕ | KRA/KPI | Target | Weightage ↕ | Achieved | [scores ↕...] | Status ↕ | Actions
```

The sort wraps the incoming `kpis` prop in a `useMemo` — original array is never mutated. Default state: no active sort (preserves original order).

Since all 6 dashboards (EmployeeScorecard, UnifiedScorecard, AuditScorecard, ManagementScorecard) use `KpiDetailsTable`, sorting is automatically available everywhere.

### Files Modified

| File | Change |
|------|--------|
| `src/components/review/KpiDetailsTable.tsx` | Add sort state, sortable headers, sorted kpis memo |
| `DOCUMENTATION.md` | v2.15.4 changelog |

### Risk Assessment
- **Regression**: Zero — additive UI change, no data/DB modifications
- **Performance**: Single `useMemo` with sort; negligible for typical KPI counts


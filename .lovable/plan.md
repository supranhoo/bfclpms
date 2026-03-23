

## Performance Optimization Plan

### Problem
The Management Dashboard, All KPIs page, and review grids are slow because they fetch excessive data (full `*` columns), perform heavy client-side computation on large datasets, and lack query deduplication.

### Root Causes Identified

1. **Over-fetching columns**: `useAllKpis()` and `useKpisByPeriod()` select `*` from kpis (30+ columns) when most consumers only need 10-15 fields. The ManagementDashboard only uses ~8 fields but fetches everything.

2. **ManagementDashboard fetches ALL profiles**: Loads every profile in the org (`profiles` table) even when hierarchy filters are active.

3. **Duplicate data fetching**: AllKpis page calls both `useKpisByPeriod()` AND `useAllKpis()` simultaneously (line 90). The `useAllKpis` query runs unconditionally.

4. **No pagination on employee tables**: AllKpis renders all employees at once (potentially 400+ rows).

5. **Heavy `useMemo` chains**: Multiple expensive `useMemo` computations run on every render cycle in ManagementDashboard (division stats, rating distribution, trend data).

### Changes

#### 1. `src/hooks/useKpis.ts` — Slim column selection for bulk queries

**`useAllKpis()`**: Replace `*` with only the columns actually used by consumers:
```sql
id, employee_id, category_id, kra_name, kpi_name, status, weightage,
review_period, review_year, frequency, is_org_level, org_level_scope,
uom, uom_type, criteria, target_value, r5, r4, r3, r2, r1, r0,
sub_frequency, frequency_cycle_start, source_template_id, threshold_mode,
kra_categories (id, name, color, weightage),
profiles:employee_id (id, full_name, email, employee_code, department_id, reporting_manager_id)
```

**`useKpisByPeriod()`**: Same slim select.

**`useKpisByPeriodRanges()`**: Same slim select.

#### 2. `src/pages/ManagementDashboard.tsx` — Optimize the dashboard query

- **Slim KPI select**: The `fetchFiscalData` inner function selects only `id, employee_id, status, weightage, review_period, review_year, frequency` + `review_submissions(...)`. This is already lean — no change needed there.
- **Filter profiles server-side**: When hierarchy filters are active, filter the profiles query by department/division instead of fetching all 450+ profiles.
- **Add `placeholderData: keepPreviousData`** to the main dashboard query to prevent blank flashes when filters change.

#### 3. `src/pages/admin/AllKpis.tsx` — Stop dual-fetching

- Guard `useAllKpis()` with `enabled: isAllPeriods` so it only runs when "all periods" is actually selected (line 90). Currently it always fetches.
- Add client-side pagination (show 50 employees at a time with "Load more" button) to reduce DOM size.

#### 4. `src/components/review/EmployeeSelectorGrid.tsx` — Reduce re-renders

- Wrap employee card rendering in `React.memo` to prevent re-renders when sibling state changes.
- Add `placeholderData: keepPreviousData` to the `useKpisByPeriodRanges` call to prevent flash on period change.

#### 5. Global query config — Add `keepPreviousData` pattern

Update key data-fetching hooks (`useAllKpis`, `useKpisByPeriod`, `useKpisByPeriodRanges`) to include `placeholderData: keepPreviousData` from TanStack Query, so stale data stays visible while fresh data loads.

### Expected Impact
- **~40-60% reduction in payload size** for KPI list queries (removing 15+ unused columns per row × 1000+ rows)
- **Elimination of redundant AllKpis fetch** (currently loads all KPIs even when period-filtered)
- **Smoother UI transitions** with keepPreviousData (no blank states between filter changes)
- **Reduced DOM nodes** on AllKpis page via pagination

### No database changes needed


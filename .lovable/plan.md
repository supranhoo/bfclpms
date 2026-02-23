

# Fix: Incorrect Per-Employee Targets in Org KPI Data Entry

## Problem

All employee rows display "35" as the target, even though the database stores different targets per employee (14, 35, 70, 140, 315). The card-level fallback target of 35 is being used for all rows.

## Root Cause

The separate `employeeKpiData` query (line 107-139 in `OrgKpiDataEntry.tsx`) uses `.eq('kpi_name', kpi.kpi_name)` where the `kpi_name` contains multi-line text with newlines, formula text, and special characters. This likely causes a URL-encoding mismatch in the PostgREST query parameter, resulting in zero results returned. With no results, the `employeeTargetMap` is empty, `empTarget` is always undefined, `row.targetValue` is set to `null`, and the `!= null` fallback correctly falls back to the card-level target (35).

## Solution: Eliminate the Fragile Separate Query

Instead of making a second query with problematic string matching, build the per-employee target map directly inside the `useOrgLevelKpisWithEmployees` hook, which already fetches ALL KPI records (`SELECT *`) before deduplication. The raw records contain each employee's `target_value` and `uom`.

### 1. `src/hooks/useOrgLevelKpis.ts` -- Build target map before dedup

After the first query returns all org-level KPI records (line 60-68) and before deduplication, iterate over all records to build a `perEmployeeTargetMap` keyed by `category_id||kra_name||kpi_name||employee_id`. Return this map in the hook's result alongside `kpis`, `unmappedCount`, and `totalOrgKpis`.

### 2. `src/pages/admin/OrgKpiDataEntry.tsx` -- Use the hook-provided map

- Remove the separate `employeeKpiData` query (lines 101-142) entirely since the hook now provides the target map.
- Extract the `perEmployeeTargetMap` from `orgLevelData`.
- In `buildCardData`, use this map instead of the removed `employeeTargetMap`.
- Keep the `employeeKpiIdsMap` functionality by building it from the same hook data (or keep a simplified version of the query that only fetches IDs).

### 3. `DOCUMENTATION.md` -- Version bump to 1.45.81

## Technical Details

| Aspect | Detail |
|--------|--------|
| Files changed | `useOrgLevelKpis.ts`, `OrgKpiDataEntry.tsx`, `DOCUMENTATION.md` |
| Root cause | PostgREST `.eq()` with multi-line kpi_name string likely fails silently |
| Data source | Same `allOrgKpis` query already fetched, just not discarded during dedup |
| DB changes | None |
| RLS impact | None |
| Regression risk | Low -- removes a fragile secondary query in favor of data already available |


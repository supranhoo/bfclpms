## Risk & Impact Report

- **Data impact:** No existing Org KPI data will be changed or deleted. This is a read-path optimization. It will add one backend read function and supporting indexes only.
- **Workflow impact:** Org KPI entry, owner filtering, propagation, save, rollback, and import/export workflows stay the same. Access must remain role/owner-controlled inside the backend function.
- **UI/UX impact:** The page should load the same cards, filters, progress, and diagnostics, but with fewer timeout/retry states.
- **Regression risk:** Medium, because this page builds many derived maps from `kpis`, `profiles`, and `org_kpi_values`. Mitigation: preserve the hook return contract and add regression tests around counts, empty states, and timeout/error handling.
- **Mitigation plan:** Keep the existing UI contract, add a server-side snapshot function, reduce payloads, retain query-error UI, and update POLICY.md/DOCUMENTATION.md with the new read-path rule.

## What I found

- Data exists: April 2026 has **862 org-level KPI child rows**, deduping to **166 Org KPI definitions**.
- The hosted backend is healthy; this is not a backend outage.
- The current page still asks the browser to fetch/dedupe too much:
  - `useOrgLevelKpisWithEmployees` reads raw `kpis` rows and still includes the `kra_categories` join.
  - `useOrgLevelKpis` still uses `select('*')` plus category join.
  - `useOrgKpiValues` uses `select('*')` plus profile join for current and previous periods.
  - `useProfiles()` loads all active profiles and all roles, even though Org KPI cards only need mapped employees/departments for the selected period.
- The index added earlier helps the plain database scan, but it does not fully remove the heavy client-side read path and RLS overhead.

## Optimization Plan

### 1. Add a secure backend snapshot function for the Org KPI page
Create a read-only backend function like `get_org_kpi_data_entry_snapshot(period, year)` that returns already-prepared Org KPI definitions for the selected period/year:

- one row per unique KPI definition, not 862 raw child rows
- employee count
- active employee IDs
- department IDs
- per-employee target map data
- KPI IDs for observation panels
- `kra_set` child row IDs and employee IDs for stuck detection
- category metadata

The function will enforce access inside the function:

- admins can read all org KPI definitions
- data owners can read only assigned org KPI definitions
- inactive users remain excluded from counts and mappings

This avoids exposing a broad `kpis` read through repeated RLS checks and avoids browser-side deduping.

### 2. Add supporting indexes for the new access path
Add narrowly targeted indexes used by the snapshot and value lookups:

- `kpis`: period + org-level + normalized definition matching + employee/status fields
- `org_kpi_values`: period/year + category/normalized definition + department/employee for fast current/previous value lookup
- `org_kpi_data_owners`: owner/category/normalized definition lookup, if the existing expression index is not sufficient for the new function shape

No table schema changes are needed.

### 3. Refactor `useOrgLevelKpisWithEmployees` to use the snapshot
Replace the paged client query with the backend snapshot call, but keep the same returned shape so `OrgKpiDataEntry.tsx` needs minimal changes.

Expected result:

```text
Before: browser fetches 862 raw kpis rows + joins + profiles, then dedupes to 166 cards
After: backend returns 166 prepared card definitions + mapping arrays
```

### 4. Make Org KPI value reads lean and period-specific
Refactor `useOrgKpiValues` so the Org KPI Data Entry page does not fetch `*` unnecessarily:

- current period: only fields needed for cards/save/status display
- previous period: only `category_id`, `kra_name`, `kpi_name`, `achieved_value`
- keep profile name join only where scorecards actually need `entered_by_name`

This reduces payload and prevents unrelated large fields/evidence/history columns from slowing initial load.

### 5. Remove redundant full-profile loading from this page where possible
For the Org KPI page, use mapped employee/department data from the snapshot instead of loading all profiles/roles globally.

If any UI still needs profile display fields, load only the mapped profile IDs and only necessary columns.

### 6. Keep the query-error state, but make Retry refetch all relevant queries
The retry button should refetch/invalidate:

- snapshot query
- current org KPI values
- previous org KPI values
- ownership query

This keeps the “data is safe, retry” state accurate while making it less likely to appear.

### 7. Regression tests and documentation
Add/update tests for:

- snapshot result normalization/deduping
- active-only employee counts
- query-error does not become “no data”
- previous value lean mapping still works
- data-owner access filtering shape

Update:

- `POLICY.md` with the rule: Org KPI Data Entry must use the backend snapshot, not raw `kpis` page reads.
- `DOCUMENTATION.md` version history with the RCA and optimization.
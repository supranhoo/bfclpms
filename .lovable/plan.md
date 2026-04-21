<final-text>## RCA — KPI Scorecard Detail Still Shows 0 Rows

### Confirmed facts
- The **1000-row paging fix is already in the code**:
  - `src/hooks/useCompanyFilter.ts` uses `fetchAllPaged`
  - `src/pages/reports/KpiScorecardDetail.tsx` uses `fetchAllPaged` for `profiles` and `org_kpi_data_owners`
- The database **does contain March 2026 data**:
  - `1,758` KPIs
  - `107` distinct employees
- Your screenshot shows:
  - `March`
  - `2026`
  - `All Companies`
  - `All Departments`
  - no visible search term
  - still `0 KPIs`
- The page currently **does not surface query errors**. If the query fails or returns nothing because of access scope, the UI still shows:
  - `0 KPIs`
  - `No KPIs found for the selected filters`

### Assumptions I am not making silently
I cannot prove which of these is happening for your current login without implementation/runtime instrumentation, so I am treating both as live possibilities:

1. **Access-scope mismatch**
   - The report is described as org-wide: “Flat table of all KPIs…”
   - But the app currently grants route access to `manager`
   - RLS on `kpis` gives managers access only to **their own direct reports**
   - So for a manager (or admin switched into natural manager UI mode), this report can legitimately return 0 rows even though the org has 1,758 rows

2. **Client is masking a real fetch failure**
   - `KpiScorecardDetail.tsx` reads `rows`, `isLoading`, `isFetching`
   - but does **not** handle `error`
   - so a failed query can look identical to “no data”

### Multiple valid interpretations
#### Interpretation A — This report is supposed to be org-wide
Then the current setup is inconsistent:
- UI/report description says org-wide
- route access includes manager
- DB access for manager is team-scoped only

#### Interpretation B — This report is supposed to be team-scoped for managers
Then the current setup is misleading:
- report title/description are too broad
- empty results are expected for some managers
- the page needs scope disclosure, not broader access

### Recommended direction
Use the safer interpretation first:

**Recommended:** keep this report **org-wide only** and restrict it to roles that already have org-wide read access (`admin`, `management`, `hr_pms`, `auditor`, explicit override users).

Reason:
- simpler
- safer
- aligned with the current report description
- avoids expanding sensitive KPI visibility to all managers

I would push back on silently granting org-wide KPI visibility to managers unless that is an explicit policy decision.

---

## Plan — Fix the real bug, not the symptom

### 1. Expose the actual failure mode in the UI
Update `src/pages/reports/KpiScorecardDetail.tsx` so it distinguishes:
- **not loaded yet**
- **loading**
- **query error**
- **loaded with 0 rows**

Add explicit handling for:
- `error`
- partial nested-fetch failures
- access-scope empty states

Result:
- users stop seeing “No KPIs found” when the real problem is access or query failure

### 2. Make the report scope honest
Update access/scope in one of these two ways:

#### Recommended path
- Remove `manager` from `kpi-scorecard-detail` default access in `src/hooks/useReportAccess.ts`
- align `report_access_config` seed / policy docs / report description
- keep report available to org-wide roles and approved override users only

#### Alternative path
If you explicitly want managers to use it:
- rename/reframe it as a **team scorecard detail**
- update description and empty-state copy to say “team data only”
- do not silently imply org-wide coverage

### 3. Add diagnostic empty states
For loaded-but-empty results, show one of:
- “No KPI rows exist for March 2026”
- “You currently do not have permission to view org-wide KPI data for this report”
- “This report is scoped to your team, and no matching KPI rows were found”

This removes ambiguity.

### 4. Keep click-to-load, but make filter state clearer
The current “Load Data / Reload” pattern is reasonable and cheaper on CPU.
I would **not** revert to auto-fetch.

Instead:
- keep click-to-load
- add a stronger “filters changed — data shown is from last load” notice
- reset `lastLoadedAt` / applied state more clearly when period changes
- optionally show “Loaded period: March 2026” beside the count

### 5. Add regression protection
Per project rules, add tests and mocks for:
- org-wide role sees March 2026 rows
- manager without org-wide access gets access-denied/scope message, not fake “No KPIs found”
- query error renders an error state
- click-to-load does not auto-fire on filter changes
- company/department/search filter only operate on already loaded rows

### 6. Sync documentation/policy
Update:
- `DOCUMENTATION.md`
- `POLICY.md` or policy section
- version history

Document:
- report scope
- why manager access was removed or reframed
- why click-to-load remains

---

## Files likely to change

| File | Change |
|---|---|
| `src/pages/reports/KpiScorecardDetail.tsx` | Add explicit `error` handling, scope-aware empty states, clearer loaded/applied-state messaging |
| `src/hooks/useReportAccess.ts` | Recommended: remove `manager` from default `kpi-scorecard-detail` access if report stays org-wide |
| `src/components/layout/ReportRoute.tsx` | No logic change likely, but confirm route behavior with updated access rules |
| `DOCUMENTATION.md` | Sync report scope, RCA, click-to-load pattern |
| `POLICY.md` / policy section | Sync access policy if report scope is changed |
| test files | Add unit/component tests for error/scope/empty-state behavior |
| mock data | Add realistic March 2026 KPI fixtures for org-wide vs manager-scoped cases |

---

## Risk & Impact Report

### Data impact
- No schema change required for the recommended fix
- No historical KPI data changes

### Workflow impact
- If manager access is removed, some users may lose access to this report
- That is intentional if the report is defined as org-wide

### UI/UX consistency
- Improves clarity by separating:
  - no data
  - no permission
  - query failed

### Regression risk
- Low to medium
- Main risk is changing access expectations for manager users

### Mitigation
- keep RLS unchanged unless policy explicitly changes
- add tests for role-based behavior
- document scope clearly in UI and docs

---

## Tradeoff summary
- **Simpler and safer:** restrict this report to org-wide roles and fix the UI states
- **More permissive but riskier:** expand manager visibility to org-wide KPI data
- **Best compromise if managers still need something:** keep this report org-wide, and create/use a separate team-scoped detail report

</final-text>


## Add Company Filter to All Reports

### Problem
Reports currently fetch ALL data across all companies with no company-level filtering. The user needs a Company selector on every report, and data should be scoped to the selected company.

### Root Cause of "Blank Reports"
The user likely expected company-scoped data but reports have no company awareness. All 461 employees belong to "Bihar Foundry & Casting Limited" (BFCL); "Saibal Kunar" has 0 employees. Selecting Saibal would correctly show empty data since no employees are mapped to it.

### Data Chain
```text
profiles.department_id → departments.business_unit_id → business_units.division_id → divisions.company_id → companies
```

### Architecture

#### 1. Shared Hook: `useCompanyFilter`
A new reusable hook that:
- Fetches all companies from `companies` table
- Maintains `selectedCompanyId` state (defaults to the default company or "all")
- Provides a `filterByCompany(employeeIds)` function that resolves employee → department → BU → division → company chain
- Caches the employee-to-company mapping for performance
- Returns `{ companies, selectedCompanyId, setSelectedCompanyId, companyEmployeeIds, CompanyFilterSelect }`

#### 2. Shared Component: `CompanyFilter`
A reusable `<Select>` component rendered in each report's filter area:
- Options: "All Companies" + list of companies from DB
- Compact design matching existing filter patterns

#### 3. Integration Strategy
Two patterns exist across reports:

**Pattern A — Reports using `useAllKpis()`** (Performance, Query, Completion, Department, KRA Issuance):
- Filter `allKpis` by checking if `kpi.employee_id` is in `companyEmployeeIds`

**Pattern B — Reports with direct Supabase queries** (KPI Scorecard Detail, Employee Performance Summary, Monthly Scorecard, Incentive, etc.):
- Add company filter to the query by joining through the department → BU → division → company chain, OR
- Post-filter results using the employee-to-company map from the hook

**Recommended approach**: Build a DB view or use the hook to pre-compute `employeeId → companyId` mapping. Post-filter in each report using this map. This avoids modifying 15+ different Supabase queries.

#### 4. Employee-Company Mapping
Create a `useEmployeeCompanyMap` hook that:
```typescript
// Fetches departments with BU → division → company chain
// Returns Map<employeeId, companyId>
```
Each report filters its data: `kpis.filter(k => !selectedCompanyId || employeeCompanyMap.get(k.employee_id) === selectedCompanyId)`

### Files to Change

| File | Change |
|------|--------|
| `src/hooks/useCompanyFilter.ts` | **New** — shared hook with company selector state + employee-company mapping |
| `src/components/reports/CompanyFilter.tsx` | **New** — reusable company selector component |
| `src/pages/reports/PerformanceReport.tsx` | Add CompanyFilter + filter scopedKpis by company |
| `src/pages/reports/QueryReport.tsx` | Add CompanyFilter + filter queries by company |
| `src/pages/reports/CompletionReport.tsx` | Add CompanyFilter + filter KPIs by company |
| `src/pages/reports/DepartmentReport.tsx` | Add CompanyFilter + filter KPIs by company |
| `src/pages/reports/KRAIssuance.tsx` | Add CompanyFilter + filter KPIs by company |
| `src/pages/reports/KpiScorecardDetail.tsx` | Add CompanyFilter + filter rows by company |
| `src/pages/reports/EmployeePerformanceSummary.tsx` | Add CompanyFilter + filter data by company |
| `src/pages/reports/MonthlyScorecardReport.tsx` | Add CompanyFilter + filter data by company |
| `src/pages/reports/IncentiveReport.tsx` | Add CompanyFilter + filter data by company |
| `src/pages/reports/BottleneckReport.tsx` | Add CompanyFilter + filter data by company |
| `src/pages/reports/KpiDetailReport.tsx` | Add CompanyFilter + filter data by company |
| `src/pages/reports/KpiJourneyReport.tsx` | Add CompanyFilter + filter data by company |
| `src/pages/reports/KpiStatusTracker.tsx` | Add CompanyFilter + filter data by company |
| `src/pages/reports/ManagerTeamKpiReport.tsx` | Add CompanyFilter + filter data by company |
| `src/pages/reports/AuditTrailReport.tsx` | Add CompanyFilter + filter data by company |
| `src/pages/reports/TNIReport.tsx` | Add CompanyFilter + filter data by company |
| `src/pages/reports/TeamVsManagerScoreReport.tsx` | Add CompanyFilter + filter data by company |
| `src/pages/reports/VarianceReport.tsx` | Add CompanyFilter + filter data by company |
| `src/pages/reports/IssuesReport.tsx` | Add CompanyFilter + filter data by company |
| `DOCUMENTATION.md` | Version bump |

### Risk Assessment
- **No data changes**: Read-only filter, no schema modifications
- **No regression**: Default is "All Companies" — existing behavior preserved
- **Performance**: One additional query for department-BU-division-company chain (small, cached)
- **Consistency**: Same component used across all 19 reports ensures uniform UX




## KPI-Employee Weighted Score Matrix Report

### Concept
A cross-tab/pivot report where **rows = KRA + KPI** and **columns = Employee names**, with cells showing the **weighted score** (weightage × best-available score). This gives a bird's-eye view of which KPIs are mapped to which employees and their scoring weight — useful for role planning and top-to-bottom KPI flow analysis.

### Data Scale Challenge
Current data: **855 unique KPIs × 110 employees** for a single month. A full matrix is too large for on-screen display. The solution uses heavy filtering + an Excel export for the complete view.

### Report Layout (Reference: uploaded image)

```text
┌──────┬─────────────────┬──────────────────┬────┬────┬──────┬──────┬──────┐
│ Sr.  │ KRA Area        │ KPI Details      │ Wt │ Emp│ Emp  │ Emp  │ ...  │
│ No.  │                 │                  │  % │  A │  B   │  C   │      │
├──────┼─────────────────┼──────────────────┼────┼────┼──────┼──────┼──────┤
│  1   │ Account Recon   │ Ledger Recon ... │ 10 │ 3.0│  -   │ 4.5  │      │
│  2   │ Account Recon   │ FD Statements ..│2.5 │  - │ 2.0  │  -   │      │
│  3   │ Book Closure    │ On time P&L ... │ 9  │ 4.0│  -   │  -   │      │
└──────┴─────────────────┴──────────────────┴────┴────┴──────┴──────┴──────┘
                                              Employee names rotated vertically
```

### Features

**Filters (cascading):**
- Company, Division, Business Unit, Department
- Category (KRA Category)
- Grade, Designation
- Review Period + Year
- Search (employee name / KPI name)

**On-screen table:**
- Rows: Category → KRA → KPI (grouped/sorted)
- Fixed columns: Sr. No., Category, KRA, KPI Name, Weightage, Employee Count
- Dynamic columns: One per filtered employee (name rotated vertically like the reference image)
- Cell value: Weighted score (best-available from the 8-stage fallback) or "—" if KPI not mapped to that employee
- Color coding: mapped cells with scores vs unmapped (grey dash)

**Summary stats:**
- Total unique KPIs shown
- Total employees in view
- Average weightage coverage per employee
- KPIs with 0 employees mapped (orphan KPIs)

**Excel export:**
- Full matrix with all filtered data
- Employee names as column headers
- Category/KRA/KPI/Weightage/UOM as row metadata
- Weighted scores in cells
- Summary sheet with employee-level totals

### Technical Approach

**New files:**
| File | Purpose |
|---|---|
| `src/pages/reports/KpiEmployeeMatrix.tsx` | Report page with filters, table, and export |
| `src/hooks/useKpiEmployeeMatrix.ts` | Data fetching hook — batch-fetches `kpis` + `review_submissions` + `profiles`, builds cross-tab in memory |

**Existing patterns reused:**
- `useCompanyFilter` + `CompanyFilter` for company scoping
- `ReviewPeriodSelector` for month/year
- Org hierarchy hooks (`useDivisions`, `useBusinessUnits`, `useDepartments`)
- `useReportAccess` for visibility gating
- XLSX export pattern from existing reports

**Route & menu:**
- Add to `ReportsHub.tsx` with key `kpi-employee-matrix`
- Register route in app router

**Performance guards:**
- Department filter required before rendering matrix (prevents 855×110 explosion)
- Paginate KPI rows (50 per page)
- Limit visible employee columns to filtered set
- Excel export bypasses pagination for full download

### No Database Changes Required
All data exists in `kpis`, `review_submissions`, `profiles`, `kra_categories`, and org tables. Pure client-side pivot.

### Risk Assessment
- **Data Impact**: None — read-only report
- **Performance**: Mitigated by mandatory department filter + pagination
- **Regression**: None — new page, no changes to existing code
- **Security**: Uses existing RLS on `kpis` and `profiles` tables


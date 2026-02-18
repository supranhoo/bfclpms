
# New Report: KPI Detail Report — Full Specification (Including N/A KPIs)

## Confirmed: N/A KPI Handling

This is the key difference from all existing reports:

| Report | N/A KPIs |
|---|---|
| Employee Performance Summary | Skipped entirely — not in output |
| Monthly Scorecard | Skipped from score calculation |
| **This new KPI Detail Report** | **Included — all score columns show "N/A", excluded from Total Score / Out of Score / Percentage** |

For each N/A KPI row:
- Employee Code, Name, Category, KRA, KPI, Month, Weightage — all show normally
- Self, Manager, Skip-Level, HR PMS, Auditor, Mgmt, Final — all show a styled **"N/A"** badge
- Total Score — shows **"—"** (dash, excluded from weighted calculation)
- Out of Score — shows **"—"**
- Overall Rating — shows **"N/A"** badge
- Percentage — shows **"—"**

In the Excel export, N/A rows are included with "N/A" text in all score columns and blank cells for Total Score / Out of Score / Percentage.

---

## Report Columns (Exact Order as Requested)

| # | Column | Source | Notes |
|---|---|---|---|
| 1 | Employee Code | `profiles.employee_code` | |
| 2 | Employee Name | `profiles.full_name` | |
| 3 | Category | `kra_categories.name` | |
| 4 | KRA | `kpis.kra_name` | |
| 5 | KPI | `kpis.kpi_name` | |
| 6 | Month | `kpis.review_period` | e.g. "January" |
| 7 | Weightage | `kpis.weightage` | |
| 8 | Self | `review_submissions.self_score` | "N/A" if is_na |
| 9 | Manager | `review_submissions.manager_score` | "N/A" if is_na |
| 10 | Skip-Level | `review_submissions.skip_level_score` | "N/A" if is_na |
| 11 | HR PMS | `review_submissions.hr_pms_score` | "N/A" if is_na |
| 12 | Auditor | `review_submissions.auditor_score` | "N/A" if is_na |
| 13 | Mgmt | `review_submissions.management_score` | "N/A" if is_na |
| 14 | Final | `review_submissions.final_score` (with fallback chain) | "N/A" if is_na |
| 15 | Total Score | `final_score × weightage` | "—" if is_na |
| 16 | Out of Score | `weightage × 5` | "—" if is_na |
| 17 | Overall Rating | Label from score (e.g. "Meets Expectations") | "N/A" if is_na |
| 18 | Percentage | `(Total Score / Out of Score) × 100` | "—" if is_na |

**Final Score fallback chain** (same as all existing reports):
`final_score → management_score → auditor_score → hr_pms_score → skip_level_score → manager_score → self_score → 0`

**Overall Rating labels** (from `ratingCalculation.ts`):
- 5 → Outstanding
- 4 → Exceeds Expectations
- 3 → Meets Expectations
- 0–2.99 → Below Expectations

---

## Filters

- **Year** — dropdown, defaults to current year
- **Month** — "All Periods" or specific month (January → December)
- **Department** — optional dropdown populated from data
- **Category** — optional dropdown populated from `kra_categories`
- **Employee search** — text search on name or code
- **Include N/A KPIs** — toggle switch, ON by default (honours the user's request to show N/A; can be turned off)

---

## Architecture

### New File: `src/pages/reports/KpiDetailReport.tsx`

**Data strategy** — two parallel queries:

1. **KPIs query** (batched, 1,000 rows per page):
```
kpis (id, kra_name, kpi_name, weightage, review_period, review_year, employee_id, category_id)
  → kra_categories (id, name)
  → review_submissions (self_score, manager_score, skip_level_score, hr_pms_score, auditor_score, management_score, final_score, is_na)
  → profiles (employee_code, full_name, departments(name))
```

2. **Profiles query** (single fetch, for department filter population)

This follows the identical batching pattern used in `EmployeePerformanceSummary.tsx` (while loop with `range(offset, offset + batchSize - 1)`).

**Data interface:**
```typescript
interface KpiDetailRow {
  kpiId: string;
  employeeCode: string;
  employeeName: string;
  department: string;
  category: string;
  kraName: string;
  kpiName: string;
  reviewPeriod: string;
  reviewYear: number;
  weightage: number;
  selfScore: number | null;
  managerScore: number | null;
  skipLevelScore: number | null;
  hrPmsScore: number | null;
  auditorScore: number | null;
  managementScore: number | null;
  finalScore: number | null;      // resolved via fallback chain
  totalScore: number | null;      // null when is_na
  outOfScore: number | null;      // null when is_na
  percentage: number | null;      // null when is_na
  overallRating: string | null;   // null when is_na
  isNa: boolean;
}
```

### N/A Row Rendering Logic

```typescript
// Score cell rendering (one helper used for all 7 score columns):
function renderScore(score: number | null, isNa: boolean) {
  if (isNa) return <Badge variant="secondary">N/A</Badge>;
  if (score === null) return <span className="text-muted-foreground">—</span>;
  return <span>{score}</span>;
}

// Calculated columns:
function renderCalculated(value: number | null, isNa: boolean, format?: 'percent') {
  if (isNa) return <span className="text-muted-foreground">—</span>;
  if (value === null) return <span className="text-muted-foreground">—</span>;
  return <span>{format === 'percent' ? `${value.toFixed(1)}%` : value.toFixed(2)}</span>;
}
```

### Table Layout

The table is wide (18 columns). Layout approach:
- Outer wrapper: `overflow-x-auto`
- Inner table: `min-w-[1800px]`
- Score columns (Self → Final, Total Score, Out of Score, Percentage): `w-16 text-center text-xs`
- Text columns (Category, KRA, KPI): `min-w-[140px] whitespace-normal`
- Employee columns: `min-w-[120px]`
- Sticky first 2 columns (Employee Code + Name) using `sticky left-0 bg-background` so they stay visible while scrolling horizontally

### Summary Stats Bar (above table)

Four stat cards:
- Total KPI rows (including N/A)
- N/A KPI count
- Average Final Score (N/A excluded)
- Average Percentage (N/A excluded)

### Pagination

- Page size options: 25 / 50 / 100 / 200
- Standard prev/next controls (same pattern as `EmployeePerformanceSummary`)

### Excel Export

Using `xlsx` (already installed). N/A rows are **included** in the export:

```
Employee Code | Employee Name | Category | KRA | KPI | Month | Weightage | Self | Manager | Skip-Level | HR PMS | Auditor | Mgmt | Final | Total Score | Out of Score | Overall Rating | Percentage
```

For N/A KPIs in the spreadsheet: score columns show `"N/A"` (text), Total Score / Out of Score / Percentage cells are left blank (empty string).

---

## Integration Changes

### 1. `src/App.tsx`
Add lazy import and route:
```typescript
const KpiDetailReport = lazy(() => import('@/pages/reports/KpiDetailReport'));
// Route:
<Route path="/reports/kpi-detail" element={<ProtectedRoute allowedRoles={['admin', 'manager', 'auditor', 'management', 'hr_pms']}><KpiDetailReport /></ProtectedRoute>} />
```

### 2. `src/pages/reports/ReportsHub.tsx`
Add a new card to the `reports` array:
```typescript
{
  title: 'KPI Detail Report',
  description: 'KPI-level drill-down showing all stage scores (Self, Manager, Skip-Level, HR PMS, Auditor, Mgmt, Final) with weighted totals. Includes N/A KPIs.',
  icon: TableIcon,
  path: '/reports/kpi-detail',
  color: 'text-violet-500',
}
```

### 3. `DOCUMENTATION.md`
Version bump to **1.45.7** with description of new report.

---

## Files to Create / Modify

| File | Action | What changes |
|---|---|---|
| `src/pages/reports/KpiDetailReport.tsx` | **Create new** | Full report page (~400 lines) |
| `src/App.tsx` | **Edit** | Add lazy import + protected route |
| `src/pages/reports/ReportsHub.tsx` | **Edit** | Add report card entry |
| `DOCUMENTATION.md` | **Edit** | Version bump + new report section |

---

## Design Decisions Summary

1. **N/A KPIs are shown** — all score columns render a styled "N/A" badge; calculated columns (Total Score, Out of Score, Percentage) show a dash "—"
2. **Include N/A toggle** (ON by default) — allows the user to filter them out if needed for a clean score-only view
3. **Final score uses fallback chain** — consistent with all existing reports
4. **No new backend code or migrations** — all data already exists in `kpis`, `review_submissions`, `profiles`, `kra_categories`
5. **Sticky employee columns** — Employee Code and Name stick to the left when scrolling the wide table horizontally
6. **Excel export includes N/A rows** with "N/A" text in score columns and blank calculated columns

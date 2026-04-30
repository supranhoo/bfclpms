## Add Reporting Manager Column (with Employee Code) to Monthly Trend Report

### Goal
Add a "Reporting Manager" column to the Monthly Scorecard (Date Range/Trend) report — visible in the on-screen table and the Excel export — positioned right after the Department column. Manager renders as `FullName(EmployeeCode)`, e.g. `Jaspal(101125)`.

### Format Rules
- Manager with code: `Jaspal(101125)`
- Manager without code: `Jaspal`
- No manager assigned: `—` on screen, blank in Excel

### Files to Change

1. **`src/hooks/useMonthlyTrend.ts`**
   - Add `reportingManagerName: string | null` to `TrendEmployee`.
   - Include `reporting_manager_id` in the profiles `select`.
   - After profile fetch, dedupe non-null `reporting_manager_id`s and batch-fetch via `.in('id', uniqueManagerIds)` selecting `id, full_name, employee_code`.
   - Format helper: `code ? \`${name}(${code})\` : name`.
   - Map onto each employee row; wrap in try/catch — fall back to `null` on failure.

2. **`src/components/reports/MonthlyTrendTable.tsx`**
   - Add `<TableHead>Reporting Manager</TableHead>` after Department.
   - Add `<TableCell className="text-sm">{emp.reportingManagerName || '—'}</TableCell>`.

3. **`src/components/reports/MonthlyTrendView.tsx`**
   - Insert `'Reporting Manager': emp.reportingManagerName ?? ''` after Department in the export row mapper.
   - Extend search filter to also match manager string.

4. **`src/test/monthlyTrendCacheBust.test.ts`**
   - Assert `reportingManagerName` exists on `TrendEmployee` and that the format `${name}(${code})` is built in the hook.

5. **Documentation sync (SSOT)**
   - `mem/features/reports/monthly-scorecard-trend.md` — note `Name(Code)` format + batched manager fetch.
   - `DOCUMENTATION.md` — add Reporting Manager to the Monthly Trend column list.

### Risk & Impact
- **Data**: Read-only `.in('id', [...])` lookup on existing FK — exempt from `fetchAllPaged` per profiles-query-policy.
- **Workflow**: Additive only.
- **UI**: One extra column; horizontal scroll already enabled.
- **Regression**: Low — manager fetch isolated in try/catch; failure shows `—`.
- **Performance**: One extra query (~<200 unique managers, well under 1000 cap).

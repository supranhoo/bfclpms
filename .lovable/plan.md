
## Fix Plan: Team Vs Manager Report Still Shows No Data

### RCA
The report is not empty because data is missing. It is failing before rows can render.

**Confirmed findings**
- January 2026 has live data: **1,350 KPIs**, **81 employees**, **1,190 scored rows**
- The browser request for this report returns **400 / PGRST200**
- Exact error:
  ```text
  Could not find a relationship between 'profiles' and 'designations' in the schema cache
  ```
- In this project, `profiles` stores `designation` directly as a text field, while `department_id` is the actual relation.

### Root Cause
`src/pages/reports/TeamVsManagerScoreReport.tsx` is selecting:
```ts
profiles!kpis_employee_id_fkey(
  employee_code, full_name, reporting_manager_id,
  departments(name),
  designations(name)
)
```
But `designations(name)` is invalid in the current schema, so the entire KPI query fails and the page falls back to “No data found”.

### Risk & Impact Report
- **Data impact:** No schema change required for the main fix
- **Workflow impact:** None
- **UI/UX consistency:** No layout change; only data rendering is restored
- **Regression risk:** Low; isolated to this report query
- **Mitigation:** Reuse existing score-calculation pattern, add a regression test for row-building logic, and update docs/policy per project standards

### Implementation Plan

#### 1. Fix the broken query
Update the report query to use the actual `profiles` shape:
- Keep `departments(name)`
- Remove `designations(name)`
- Read designation from `profile.designation`

#### 2. Make row mapping schema-safe
Adjust the row builder so it uses:
- `designation: p.designation || '—'`
- `department: p.departments?.name || '—'`

This will align the report with the current backend schema and stop the runtime failure.

#### 3. Keep the batch fetch logic
Retain the paginated `.range()` fetch because large months like Jan/Feb 2026 exceed the platform’s default single-query limit.

#### 4. Add regression protection
Create a focused unit test for the report’s transformation logic (preferably by extracting the score/row builder into a small utility) to verify:
- employee weighted score is computed correctly
- manager weighted score is computed correctly
- missing manager score shows `null`
- plain-text `designation` is used instead of relational lookup

#### 5. Sync documentation
Because this is a production bug fix and your project requires atomic sync:
- Update `DOCUMENTATION.md` with the report’s actual data contract (`profiles.designation` text + `departments` relation)
- Update `POLICY.md` only if report-access/scoping behavior is changed; for this bug it likely needs only a small note or no policy change depending on implementation scope
- Append version history entry

### Important Secondary Issue Found
There is also a **separate access-control gap** in the backend function:
```sql
has_report_access_override(_user_id uuid)
```
It currently checks only `report_access_user_overrides`, not role-based entries in `report_access_config`.

That means:
- users with explicit per-user overrides get org-wide data access
- users relying only on role-based report access may still hit scope issues in some reports

This is **not the reason for the current blank page** (the current failure is the broken relation), but I recommend fixing it next so report visibility and report data scope stay consistent.

### Files to Change
- `src/pages/reports/TeamVsManagerScoreReport.tsx`
- `src/lib/...` or `src/pages/reports/...` test helper (if extracting transform logic)
- test file for regression coverage
- `DOCUMENTATION.md`
- `POLICY.md` if needed
- version history section(s)

### Expected Outcome
After this fix:
- the report will load real January/February data
- designation values will display properly
- export will include actual rows instead of an empty sheet
- the same schema mismatch won’t silently break the report again

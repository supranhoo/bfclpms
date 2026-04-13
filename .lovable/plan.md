

## Plan: Add Employee ID to Evidence Download Filenames

### Change
Add an optional `employeeCode` parameter to `buildEvidenceFileName`. When provided, it is prepended to the filename.

**Before:** `Safety_Audit_Score_Self_Evidence.pdf`
**After:** `EMP001_Safety_Audit_Score_Self_Evidence.pdf`

### Files to Modify

**1. `src/lib/storageDownload.ts`**
- Add `employeeCode?: string | null` as the first optional parameter after `url`
- If provided, prepend sanitized employee code to the parts array (max 15 chars, already alphanumeric so minimal sanitization needed)

**2. Call sites that have employee context in scope** — pass `employeeCode`:

| Component | Source of employee_code |
|---|---|
| `EmployeeScorecard.tsx` | `employee.employee_code` prop |
| `UnifiedScorecard.tsx` | `employee.employee_code` prop |
| `KpiJourneySection.tsx` | `resolvedEmployeeCode` variable |
| `ReviewTrailCard.tsx` | New optional prop `employeeCode` (passed from parent scorecards) |
| `ReviewTrailCardCompact.tsx` | New optional prop `employeeCode` |
| `ReviewStageCard.tsx` | New optional prop `employeeCode` |
| `DailySubmissionSummary.tsx` | New optional prop or from parent |
| `DailySubmissionGrid.tsx` | From `useAuth` (self-review) |
| `WeeklySubmissionTable.tsx` | From `useAuth` (self-review) |
| `ManagementScorecard.tsx` | employee prop |
| `AuditScorecard.tsx` | employee prop |

Components where no employee context exists (self-uploads, org KPIs) will continue to omit it — the parameter is optional.

**3. `DOCUMENTATION.md` / `POLICY.md`** — Version bump, changelog entry.

### Risk Assessment
- **Data impact**: None
- **Regression risk**: None — new optional parameter, all existing calls work unchanged
- **Format**: `{EmpCode}_{KPI}_{Stage}_Evidence_{N}.{ext}` — employee code is short (typically 5-8 chars), no truncation risk


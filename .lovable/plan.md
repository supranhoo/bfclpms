

# RCA and CAPA: Zero (0) Values Missing for Target Achieved / Rating

## Root Cause Analysis (RCA)

The root cause is **JavaScript's falsy evaluation of `0`**. Throughout the codebase, the logical OR operator (`||`) is used instead of the nullish coalescing operator (`??`) when handling numeric fields. In JavaScript, `0 || '-'` evaluates to `'-'` because `0` is falsy -- so legitimate zero scores and achieved values are silently discarded and displayed as blank or treated as "no data."

This affects **four distinct areas**:

### Area 1: Display / UI (showing "-" instead of "0")

| File | Line | Problematic Code | Effect |
|------|------|-------------------|--------|
| `Dashboard.tsx` | 571 | `submission?.achieved_value \|\| '-'` | Dashboard shows "-" for 0 achieved |
| `KpiHistoryCard.tsx` | 45 | `sub?.achieved_value \|\| 0` | History chart treats 0 as missing |
| `WeeklySubmissionTable.tsx` | 91 | `submission?.achieved_value?.toString() \|\| ''` | Weekly grid shows blank for 0 |

### Area 2: Score Calculations (dropping 0 from aggregations)

| File | Line | Problematic Code | Effect |
|------|------|-------------------|--------|
| `useSubPeriodSubmissions.ts` | 198 | `s.achieved_value \|\| 0` | Redundant but masks intent |
| `ManagementDashboard.tsx` | 222-224, 275, 337-339 | `submission?.final_score \|\| submission?.management_score \|\| ...` | A legitimate 0 score is skipped in the fallback chain; next non-zero level is used instead |
| `EmployeeScorecard.tsx` | 187, 362, 978 | `submission?.manager_score \|\| submission?.self_score \|\| 0` | Manager's 0 score ignored, falls through to self score |
| `AuditScorecard.tsx` | 174 | `submission?.auditor_score \|\| submission?.manager_score \|\| ...` | Same pattern |
| `ManagementScorecard.tsx` | 184 | `submission?.management_score \|\| submission?.auditor_score \|\| ...` | Same pattern |

### Area 3: Data Entry / Submission (converting 0 to null)

| File | Line | Problematic Code | Effect |
|------|------|-------------------|--------|
| `MyKpis.tsx` | 513 | `parseFloat(achievedValue) \|\| null` | Submitting "0" saves as null |
| `MyKpis.tsx` | 580 | `parseFloat(achievedValue) \|\| 0` | OK for this case but inconsistent |
| `SelfReview.tsx` | 369 | `parseFloat(achievedValue) \|\| 0` | OK but inconsistent pattern |
| `AdminDataEntryDialog.tsx` | 102-122 | `existingSubmission.achieved_value?.toString() \|\| ''` | Pre-fills blank instead of "0" |
| `useReviewPageState.ts` | 142 | `(existing?.[achievedField] as number) \|\| existing?.achieved_value \|\| null` | 0 achieved value becomes null |
| `SelfReview.tsx` | 268 | `existing.self_score \|\| null` | 0 self_score treated as no score |

### Area 4: Import / Export (losing 0 during round-trip)

| File | Line | Problematic Code | Effect |
|------|------|-------------------|--------|
| `ImportData.tsx` | 53-55, 61-63 | `row.auditRating \|\| row.auditTargetAchieved` | Status determination: rating of 0 is treated as "no data", so status defaults to wrong level |
| `ImportData.tsx` | 1070 | `String(achievedValue \|\| '')` | Achieved value of 0 becomes empty string, triggering N/A detection |
| `ImportData.tsx` | 1085-1086 | `parseFloat(...) \|\| null` | manager/auditor achieved value of 0 saved as null |

### Area 5: Reviewer Value Initialization (0 overrides lost)

| File | Line | Problematic Code | Effect |
|------|------|-------------------|--------|
| `UnifiedScorecard.tsx` | 502-504 | `(existing as any)?.[...] \|\| existing?.achieved_value \|\| null` | Reviewer's 0 override ignored |
| `AuditScorecard.tsx` | 346 | `(existing as any)?.auditor_achieved_value \|\| ... \|\| null` | Same |
| `ManagementScorecard.tsx` | 368 | `(existing as any)?.management_achieved_value \|\| ... \|\| null` | Same |

---

## CAPA (Corrective and Preventive Action)

### Corrective Actions (fix all existing bugs)

**Fix 1: Display paths -- use `!= null` check**

Replace `value || '-'` with `value != null ? value : '-'` in:
- `Dashboard.tsx` line 571
- `KpiHistoryCard.tsx` line 45
- `WeeklySubmissionTable.tsx` line 91

**Fix 2: Score fallback chains -- use `??` instead of `||`**

Replace `||` with `??` in score hierarchy chains in:
- `ManagementDashboard.tsx` (3 locations: lines 222, 275, 337)
- `EmployeeScorecard.tsx` (lines 187, 362, 978)
- `AuditScorecard.tsx` (line 174)
- `ManagementScorecard.tsx` (line 184)

**Fix 3: Data entry -- use null-safe parsing**

Replace `parseFloat(achievedValue) || null` with a helper:
```
const safeParseFloat = (v: string) => {
  const n = parseFloat(v);
  return isNaN(n) ? null : n;
};
```
Apply in:
- `MyKpis.tsx` (lines 513, 580)
- `SelfReview.tsx` (line 369)

**Fix 4: Value pre-population -- use `??` for achieved values**

Replace `||` with `??` for numeric field initialization in:
- `AdminDataEntryDialog.tsx` (lines 102-122): use `?.toString() ?? ''`
- `useReviewPageState.ts` (line 142): use `?? existing?.achieved_value ?? null`
- `SelfReview.tsx` (line 268): use `?? null`
- `UnifiedScorecard.tsx` (lines 502-504): use `??` chain
- `AuditScorecard.tsx` (line 346): use `??` chain
- `ManagementScorecard.tsx` (line 368): use `??` chain

**Fix 5: Import status determination -- use `!= null` checks**

Replace truthy checks with explicit null checks in:
- `ImportData.tsx` lines 53-55: `row.auditRating != null || row.auditTargetAchieved != null`
- `ImportData.tsx` lines 61-63: same pattern
- `ImportData.tsx` line 1070: `String(achievedValue ?? '')`
- `ImportData.tsx` lines 1085-1086: use `safeParseFloat` helper

### Preventive Actions

**Fix 6: Add `safeParseFloat` utility**

Create a shared utility in `src/lib/utils.ts`:
```
export function safeParseFloat(value: string | number | null | undefined): number | null {
  if (value == null || value === '') return null;
  const n = parseFloat(String(value));
  return isNaN(n) ? null : n;
}
```

**Fix 7: Update DOCUMENTATION.md**

Add the zero-value preservation standard as a documented coding guideline so future development avoids reintroducing this class of bug.

### Files to Modify

1. `src/lib/utils.ts` -- add `safeParseFloat` utility
2. `src/pages/Dashboard.tsx` -- display fix
3. `src/components/review/KpiHistoryCard.tsx` -- display fix
4. `src/components/review/WeeklySubmissionTable.tsx` -- display fix
5. `src/pages/ManagementDashboard.tsx` -- score chain fix (3 locations)
6. `src/components/review/EmployeeScorecard.tsx` -- score chain fix (3 locations)
7. `src/components/review/AuditScorecard.tsx` -- score chain + value init fix
8. `src/components/review/ManagementScorecard.tsx` -- score chain + value init fix
9. `src/components/review/UnifiedScorecard.tsx` -- value init fix
10. `src/pages/MyKpis.tsx` -- submission fix (2 locations)
11. `src/pages/SelfReview.tsx` -- submission + score init fix
12. `src/components/admin/AdminDataEntryDialog.tsx` -- pre-fill fix
13. `src/hooks/useReviewPageState.ts` -- value init fix
14. `src/hooks/useSubPeriodSubmissions.ts` -- aggregation fix
15. `src/pages/admin/ImportData.tsx` -- status detection + parsing fix
16. `DOCUMENTATION.md` -- document the standard

### Impact

- **Data integrity**: Zero scores and achieved values will be correctly stored, displayed, and exported
- **No breaking changes**: Only operator replacements (`||` to `??` and null checks)
- **Round-trip fidelity**: Export-edit-reimport will preserve 0 values correctly


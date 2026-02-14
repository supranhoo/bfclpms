

# RCA and CAPA: Wrong Remarks Shown in N/A Confirmation Card

## Root Cause

When a reviewer (e.g., Skip-Level Jaspal) marks a KPI as N/A, the justification is stored in their level-specific remarks field (e.g., `skip_level_remarks: "Training on 5S pending"`). However, the N/A Confirmation Card always reads from `self_remarks` to display the reason:

```text
UnifiedScorecard.tsx, line 938:
  selfRemarks={submissionMap.get(selectedKpi.id)?.self_remarks || null}
```

This means:
- Employee's self-remarks ("Attach system ss and table ss") are shown as the N/A reason
- The actual reviewer justification ("Training on 5S pending") is invisible to downstream reviewers (HR PMS, Management)

The same bug exists in all 4 scorecard components:
- `UnifiedScorecard.tsx` (line 938)
- `EmployeeScorecard.tsx` (line 731)
- `AuditScorecard.tsx` (line 765)
- `ManagementScorecard.tsx` (line 789)

## Fix

### 1. Add remarks resolution logic

When displaying the N/A reason, resolve the correct remarks based on `na_marked_by_role`:

| `na_marked_by_role` | Remarks field to show |
|---|---|
| `null` or `employee` | `self_remarks` (current behavior) |
| `manager` | `manager_remarks` |
| `skip_level` | `skip_level_remarks` |
| `hr_pms` | `hr_pms_remarks` |
| `auditor` | `auditor_remarks` |
| `management` | `management_remarks` |

### 2. Files to update

| File | Change |
|---|---|
| `src/components/review/UnifiedScorecard.tsx` | Replace hardcoded `self_remarks` with role-aware remarks lookup |
| `src/components/review/EmployeeScorecard.tsx` | Same fix |
| `src/components/review/AuditScorecard.tsx` | Same fix |
| `src/components/review/ManagementScorecard.tsx` | Same fix |
| `DOCUMENTATION.md` | Document the remarks resolution logic |

### 3. Implementation detail

Create a small helper function (inline or shared) that resolves the correct remarks:

```text
function getNaRemarks(submission):
  role = submission.na_marked_by_role
  if role == 'manager'    -> return submission.manager_remarks
  if role == 'skip_level' -> return submission.skip_level_remarks
  if role == 'hr_pms'     -> return submission.hr_pms_remarks
  if role == 'auditor'    -> return submission.auditor_remarks
  if role == 'management' -> return submission.management_remarks
  default                 -> return submission.self_remarks
```

Then in each scorecard, replace:
```text
selfRemarks={submissionMap.get(selectedKpi.id)?.self_remarks || null}
```
with:
```text
selfRemarks={getNaRemarks(submissionMap.get(selectedKpi.id)) || null}
```

## Risk: Very Low

- Only changes which remarks field is read for display -- no write logic affected
- Falls back to `self_remarks` when `na_marked_by_role` is null (backward compatible)
- No database changes needed


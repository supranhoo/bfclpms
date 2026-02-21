

# Fix: Cascade-Clear Bug Leaves Stale Reviewer Data After Send-Back

## Problem

When an auditor (or any reviewer) sends a KPI back to an earlier stage, the cascade-clear logic in `UnifiedScorecard.tsx` fails to clear the auditor's own data if intermediate workflow stages (like `hr_pms_review`, `skip_level_check`) are absent from the employee's pipeline.

**Confirmed case:** KPI `7e7316db` for Dippendu Das has `status = self_review` but still contains `auditor_score: 3.00` with remarks. The Review Journey incorrectly shows auditor data on a KPI that is back at self-review.

## Root Cause

The cascade-clear uses `statusOrder.indexOf('hr_pms_review')` to decide whether to clear auditor fields. When `hr_pms_review` is not in the employee's pipeline, `indexOf` returns `-1`. The check `targetIdx <= -1` is always false, so auditor fields are never cleared.

Same issue affects `skip_level_check` and `hr_pms_review` lookups -- any missing intermediate stage causes the cascade to silently skip clearing downstream fields.

**Employee's actual pipeline:** `[kra_set, self_review, audit, management_review, approved]`
Missing stages: `manager_check`, `skip_level_check`, `hr_pms_review`

## Fix

### 1. Update cascade-clear logic in `src/components/review/UnifiedScorecard.tsx` (lines 547-590)

Change each condition from "target is at or before the **preceding** stage" to "target is **before** the stage's own status." This eliminates dependency on intermediate stages that may not exist.

```text
Current (broken):                          Fixed:
clear manager if target <= self_review     clear manager if target < manager_check  (or stage absent)
clear skip    if target <= manager_check   clear skip    if target < skip_level_check (or stage absent)
clear hr_pms  if target <= skip_level      clear hr_pms  if target < hr_pms_review   (or stage absent)
clear auditor if target <= hr_pms_review   clear auditor if target < audit            (or stage absent)
clear mgmt    if target < management       clear mgmt    if target < management_review
```

When a stage is absent from the pipeline (`indexOf` returns `-1`), the fields for that stage are always cleared (since they are irrelevant to the pipeline).

### 2. Fix stale data for already-affected KPIs

Run a one-time data correction query to clear auditor/management data on KPIs that are currently at `self_review` or `kra_set` status but still have stale reviewer data.

```sql
UPDATE review_submissions rs
SET auditor_rating = NULL, auditor_score = NULL, 
    auditor_remarks = NULL, auditor_evidence_url = NULL, 
    auditor_achieved_value = NULL,
    management_rating = NULL, management_score = NULL,
    management_remarks = NULL, management_evidence_url = NULL,
    management_achieved_value = NULL
FROM kpis k
WHERE rs.kpi_id = k.id
  AND k.status IN ('kra_set', 'self_review')
  AND (rs.auditor_score IS NOT NULL OR rs.management_score IS NOT NULL);
```

### 3. Also fix the same pattern in `useSendBackKpi` hook (`src/hooks/useKpis.ts`)

The `useSendBackKpi` hook (lines 940-1040) uses a different approach -- it hardcodes clearing ALL fields. This is correct but only used by the manager role. The `UnifiedScorecard` inline mutation is used by auditor/management/hr_pms/skip_level. No change needed in `useKpis.ts` but worth noting.

### 4. Update `DOCUMENTATION.md`

Version bump to 1.45.50 with a note about the cascade-clear fix.

## Files to Modify

- `src/components/review/UnifiedScorecard.tsx` -- Fix cascade-clear conditions (lines 547-590)
- `DOCUMENTATION.md` -- Version bump

## Impact

- Sending back a KPI will now correctly clear all downstream reviewer data regardless of which intermediate stages exist in the pipeline
- Existing stale data on affected KPIs will be corrected by the migration
- No breaking changes for any other workflow or role


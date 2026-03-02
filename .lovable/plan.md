

# Fix: Admin NA Marking Not Updating Score for Approved KPIs

## Problem
When an admin marks a KPI as "Not Applicable" (NA) via the Admin Data Entry dialog, the system:
1. Sets `is_na = true` on `review_submissions`
2. Sets `na_marked_by_role = 'admin'`

But it does NOT:
- Clear `final_score` and `final_rating` (which the dashboard uses to display scores for approved KPIs)
- Clear `self_score`, `manager_score`, etc. (the role-level scores that feed into calculations)

Since Jaspal's December KPI is already in `approved` status, the dashboard reads `final_score` directly, ignoring the `is_na` flag for display purposes.

## Root Cause
In `src/hooks/useAdminDataEntry.ts`, lines 133-140, the NA handling only sets the boolean flag but doesn't nullify the scoring fields. The scoring engine's 8-stage fallback chain (`final_score -> management -> auditor -> ... -> 0`) doesn't check `is_na` before returning a value.

## Fix Details

### File: `src/hooks/useAdminDataEntry.ts`

After setting `is_na = true` (around line 136), also clear all scoring fields when NA is toggled ON:

```
if (is_na) {
  updateFields.final_score = null;
  updateFields.final_rating = null;
  updateFields.achieved_value = null;
  updateFields.self_score = null;
  updateFields.self_rating = null;
  updateFields.manager_score = null;
  updateFields.manager_rating = null;
  updateFields.skip_level_score = null;
  updateFields.skip_level_rating = null;
  updateFields.hr_pms_score = null;
  updateFields.hr_pms_rating = null;
  updateFields.auditor_score = null;
  updateFields.auditor_rating = null;
  updateFields.management_score = null;
  updateFields.management_rating = null;
}
```

This ensures that:
- The dashboard immediately shows no score (or "N/A") for the KPI
- Weighted score calculations exclude this KPI
- The change is reflected on the employee's dashboard without needing a rollback

### File: `src/hooks/useAdminDataEntry.ts` (query invalidation)

Add `my-kpis` to the `onSuccess` invalidation list so the employee's dashboard refreshes:

```
queryClient.invalidateQueries({ queryKey: ['my-kpis'] });
```

### File: `POLICY.md`

Add a policy note under the Admin Data Entry section documenting that marking a KPI as NA from admin clears all scoring fields across all review levels.

## Risk Assessment

| Aspect | Risk | Mitigation |
|---|---|---|
| Data Impact | Medium -- clears existing scores | Only triggered when admin explicitly toggles NA ON; scores are preserved in audit log (old_value) |
| Regression | Low | The NA toggle is explicit; normal data entry (non-NA) is unaffected |
| Reversibility | Full | Admin can toggle NA OFF and re-enter scores, or use the existing audit trail to restore values |


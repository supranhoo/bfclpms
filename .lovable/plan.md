

# Fix: "Cannot determine rollback target status" Error

## Root Cause

A race condition between the workflow stages query and the rollback dialog.

1. The employee's KPI is at status `skip_level_check` (or `hr_pms_review`)
2. `useEmployeeWorkflowStages(profile?.id)` is still loading when the user clicks "Submit Request"
3. `effectiveStages` falls back to `DEFAULT_WORKFLOW_STAGES` which only has 6 stages: `['kra_set', 'self_review', 'manager_check', 'audit', 'management_review', 'approved']`
4. `skip_level_check` is NOT in the default stages, so `resolvePreviousStatus` returns null
5. The mutation throws "Cannot determine rollback target status"

## Fix

### 1. Update `RollbackRequestDialog` to disable submit until stages are confirmed

Pass a `stagesLoading` prop and also validate that the current status exists in the provided stages before allowing submission. If stages are still loading, show a loading state on the submit button.

### 2. Update `SelfReviewSheet` and `UnifiedScorecard` to pass loading state

Both components already have `useEmployeeWorkflowStages` -- pass its `isLoading` state to the dialog.

### 3. Add a safety fallback in `useCreateRollbackRequest`

If `resolvePreviousStatus` returns null, attempt a broader lookup: check if the current status exists in the stages array at all, and if not, find the current status in the full enum order and compute the previous stage from that. This prevents the hard error even if the wrong stages are passed.

## Technical Changes

**`src/components/review/RollbackRequestDialog.tsx`**
- Add `stagesLoading?: boolean` prop
- Disable the Submit button while `stagesLoading` is true
- Show "Loading..." text on button when stages loading
- Add pre-submit validation: if `currentStatus` is not in `workflowStages`, show a toast error instead of calling the mutation

**`src/components/review/SelfReviewSheet.tsx`**
- Pass `isLoading` from `useEmployeeWorkflowStages` to `RollbackRequestDialog` as `stagesLoading`

**`src/components/review/UnifiedScorecard.tsx`**
- Pass `isLoading` from `useEmployeeWorkflowStages` to `RollbackRequestDialog` as `stagesLoading`

**`src/hooks/useKpiRollbackRequests.ts`**
- In `useCreateRollbackRequest`, add a fallback: if `resolvePreviousStatus` returns null but `current_status` is a known status, compute the target by finding the previous status in a comprehensive all-stages array as a last resort

**`DOCUMENTATION.md`**
- Version bump to 1.45.46
- Note the fix

## Impact

- Prevents the error toast for employees on custom workflows with skip-level or HR PMS stages
- No functional change when stages are loaded correctly -- the fix only activates as a safety net
- No database changes needed

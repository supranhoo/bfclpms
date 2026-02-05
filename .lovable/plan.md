

# Plan: Fix Silent RLS Failure in Manager KPI Approval

## Problem Summary

When a user with `management` role (who is NOT the employee's reporting manager) attempts to approve a KPI at `self_review` stage, the database update fails silently due to RLS policies, but the UI shows "KPI submitted successfully".

### Technical Details

| Component | Current Behavior | Expected Behavior |
|-----------|------------------|-------------------|
| `useApproveKpi` hook | Returns success even if 0 rows updated | Should throw error if no rows updated |
| Toast message | Shows "KPI approved successfully" | Should show error explaining access denied |
| KPI status | Stays at `self_review` | N/A - operation should fail clearly |
| Manager data | Not saved to `review_submissions` | N/A - operation should fail clearly |

---

## Root Cause

The Supabase client's `.update()` call returns success (no error) when RLS policies block the update - it simply affects 0 rows. The current code doesn't check if any rows were actually modified.

### Current Code (`src/hooks/useKpis.ts`)
```typescript
// Line 630-639
const { error: submissionError } = await supabase
  .from('review_submissions')
  .update({
    manager_rating,
    manager_score,
    manager_remarks,
    manager_evidence_url,
    kpi_status: 'approved_by_manager' as const,
  })
  .eq('kpi_id', kpi_id);

if (submissionError) throw submissionError;  // Only checks error, not row count
```

### RLS Policies Blocking the Update
1. **Manager policy**: Requires `p.reporting_manager_id = auth.uid()` - fails because JASPAL is not Dummy's manager
2. **Management policy**: Requires `k.status = 'management_review'` - fails because status is `self_review`

---

## Solution

### Change 1: Add Row Count Validation in `useApproveKpi`

**File**: `src/hooks/useKpis.ts` (Line 630-640)

Update the mutation to check if the update actually affected rows:

```typescript
// Update submission with manager rating
const { data: updateData, error: submissionError } = await supabase
  .from('review_submissions')
  .update({
    manager_rating,
    manager_score,
    manager_remarks,
    manager_evidence_url,
    kpi_status: 'approved_by_manager' as const,
  })
  .eq('kpi_id', kpi_id)
  .select();  // Add .select() to get the updated rows

if (submissionError) throw submissionError;

// Check if any rows were actually updated
if (!updateData || updateData.length === 0) {
  throw new Error('Unable to approve KPI. You may not have permission to review this employee, or the KPI is not at the correct stage.');
}
```

### Change 2: Same Pattern for `useAuditApproveKpi`

Check for audit approval hook and apply same fix.

### Change 3: Same Pattern for `useManagementApproveKpi`

Check for management approval hook and apply same fix.

---

## Files to Modify

| File | Change |
|------|--------|
| `src/hooks/useKpis.ts` | Add `.select()` and row count validation in `useApproveKpi` |
| Search for audit/management approve hooks | Apply same pattern |
| `DOCUMENTATION.md` | Document the RLS permission model for reviewers |

---

## Additional Consideration: UI Access Control

While fixing the silent failure is essential, we should also consider preventing the UI from showing approval buttons to users who cannot approve. However, this is a secondary concern - the primary fix is ensuring failures are not silent.

### Future Enhancement (Not in this plan)
Add a permission check before showing the "Approve" button:
- For manager-level approval: Check if current user is the employee's reporting_manager_id
- For audit-level approval: Check if user has auditor role
- For management-level approval: Check if KPI is at management_review stage

---

## Validation Checklist

After implementation:
- [ ] Attempting to approve a KPI you don't have permission for shows clear error
- [ ] Error message explains why the action failed
- [ ] Actual managers can still approve their reports' KPIs successfully
- [ ] Auditors can still approve KPIs at manager_check status
- [ ] Management can still approve KPIs at management_review status
- [ ] No silent failures - all blocked operations show user-friendly errors

---

## User Impact

Users will now see a clear error message when attempting to approve KPIs they don't have permission for, instead of seeing a success message while the data remains unchanged.


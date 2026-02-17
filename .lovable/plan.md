

# Fix: Admin Data Entry Should Advance KPI Status

## Problem

When an admin enters data for a role level via Admin Data Entry, only the `review_submissions` row is updated. The `kpis.status` column is **never advanced**, so the KPI remains stuck at its current stage (e.g., "Self Review") even after the admin has filled in the data.

In contrast, the normal self-review flow updates both `review_submissions` AND calls `kpis.update({ status: 'self_review' })`.

## Root Cause

In `useAdminDataEntry.ts`, the `useAdminSubmitReviewData` mutation:
1. Upserts `review_submissions` with the correct field values
2. Creates an audit log
3. Creates a notification
4. **Never touches `kpis.status`**

## Solution

After upserting the submission, advance the KPI status to the appropriate next stage based on the role level being entered. Use the existing `resolveForwardStatus` function from the workflow engine for reviewer levels, and set `self_review` for the self level.

Add an **optional toggle** ("Advance workflow status") so the admin can choose whether to also advance the status or just update the data without moving the workflow forward. Default it to **ON** since that matches expectations.

## Changes

### File 1: `src/hooks/useAdminDataEntry.ts`

Add a new optional field to `AdminDataEntryParams`:

```typescript
advance_status?: boolean; // Default true — advance KPI status after data entry
```

After the submission upsert (step 3), add status advancement logic:

```typescript
// 4. Optionally advance KPI status
if (advance_status !== false) {
  let newStatus: string | null = null;
  
  if (role_level === 'self') {
    newStatus = 'self_review';
  } else {
    // Use workflow engine to determine forward status
    const stages = await fetchEmployeeWorkflowStages(employee_id);
    newStatus = resolveForwardStatus(role_level, stages);
  }
  
  if (newStatus) {
    await supabase
      .from('kpis')
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq('id', kpi_id);
  }
}
```

Also set `kpi_status: 'submitted'` on the review_submissions upsert when advancing, to keep submission status in sync.

Import `resolveForwardStatus` from `@/lib/workflowEngine`.

### File 2: `src/components/admin/AdminDataEntryDialog.tsx`

Add a "Also advance workflow status" switch/checkbox in the dialog form, defaulting to checked. Pass the value as `advance_status` to the mutation.

This gives admins the flexibility to:
- Enter data AND move the workflow forward (default)
- Enter/correct data WITHOUT changing the workflow stage (when they just want to fix a value)

### File 3: `DOCUMENTATION.md`

Document that admin data entry now optionally advances the KPI workflow status.

## Technical Detail: Status Mapping by Role Level

| Role Level | KPI Status Set To |
|---|---|
| self | `self_review` |
| manager | `manager_check` |
| skip_level | `skip_level_check` |
| hr_pms | `hr_pms_review` |
| auditor | next stage after audit (from workflow engine) |
| management | `approved` |

## Files to Change

| File | Change |
|---|---|
| `src/hooks/useAdminDataEntry.ts` | Add `advance_status` param; advance `kpis.status` after submission upsert |
| `src/components/admin/AdminDataEntryDialog.tsx` | Add "Advance workflow status" toggle, default ON |
| `DOCUMENTATION.md` | Document the status advancement behavior |


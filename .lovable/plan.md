

# RCA and CAPA: Admin Step-Back Does Not Properly Reset Review Data

## Root Cause Analysis (RCA)

The Admin Step Back feature (`useAdminStatusStepBack`) has **three deficiencies** compared to the normal reviewer send-back flows:

### Issue 1: Stale Review Data Not Cleared
When the admin stepped this KPI from `management_review` all the way back to `kra_set`, the intermediate review data was **never cleared**. The `review_submissions` table still shows:
- `manager_rating: yellow`, `manager_score: 3.00` (from the previous cycle)
- `self_rating: blue`, `self_score: 5.00`

The normal Manager send-back (`useSendBackKpi`) explicitly clears `manager_rating`, `manager_score`, and `manager_remarks` when sending back. The Admin Step Back does neither -- it only updates `kpis.status` and (after the recent fix) resets `kpi_status` to `open` when going to `kra_set`.

**Result:** The Review Journey UI shows stale "N/A" ratings and old data that looks confusing -- the admin's action appears to have done nothing.

### Issue 2: No Visible Send-Back Reason
The admin's reason ("PMS Testing") is stored only in `kpi_audit_logs.metadata`. It is NOT:
- Saved as a `kpi_queries` entry (which is what `useSendBackKpi` does with `[SENT BACK] reason`)
- Shown in the Review Journey cards
- Visible to the employee in their KPI review panel

The employee only gets a generic notification but has no way to see the reason in their review workflow.

### Issue 3: No Downstream Data Cleanup
When stepping back multiple stages (e.g., `management_review` to `kra_set`), the hook should clear all downstream review data (auditor and management ratings/remarks) to prevent stale data from persisting into the next cycle.

## CAPA (Corrective and Preventive Action)

### Fix 1: Clear downstream review data on step-back
In `useAdminStatusStepBack`, after updating `kpis.status`, clear the review submission fields for the stages being bypassed:

- Step back to `kra_set`: Clear self, manager, auditor, and management fields; reset `kpi_status` to `open`
- Step back to `self_review`: Clear manager, auditor, and management fields
- Step back to `manager_check`: Clear auditor and management fields
- Step back to `audit`: Clear management fields

### Fix 2: Create a `kpi_queries` entry with the send-back reason
Match the behavior of `useSendBackKpi` by inserting a `kpi_queries` row with `[ADMIN SENT BACK] reason`. This makes the reason visible in the employee's KPI view and in the query trail.

### Fix 3: Fix the 1 currently stuck KPI's stale data
Run a one-time SQL to clear stale manager data for KPI `547c5765` since it's at `self_review` with leftover manager ratings from the previous cycle.

## Files to Modify

| Action | File |
|--------|------|
| Edit | `src/hooks/useAdminDataEntry.ts` -- add downstream data clearing and `kpi_queries` insertion |
| Migration | One-time fix to clear stale review data for the affected KPI |
| Edit | `DOCUMENTATION.md` -- document the cleanup behavior |

## Technical Details

### `useAdminStatusStepBack` changes

After the `kpis.status` update and the existing `kra_set` submission reset, add a new block:

```text
// Determine which fields to clear based on target_status
const clearFields = {};

if target_status is 'kra_set' or 'self_review':
  clearFields += { manager_rating: null, manager_score: null, manager_remarks: null, manager_evidence_url: null, manager_achieved_value: null }

if target_status is 'kra_set' or 'self_review' or 'manager_check':
  clearFields += { auditor_rating: null, auditor_score: null, auditor_remarks: null, auditor_evidence_url: null, auditor_achieved_value: null }

if target_status is 'kra_set' or 'self_review' or 'manager_check' or 'audit':
  clearFields += { management_rating: null, management_score: null, management_remarks: null, management_evidence_url: null, management_achieved_value: null }

// Update review_submissions with clearFields
supabase.from('review_submissions').update(clearFields).eq('kpi_id', kpi_id)

// Create a kpi_queries entry so the reason is visible
supabase.from('kpi_queries').insert({
  kpi_id,
  raised_by: user.id,
  raised_to: employee_id,
  reason: `[ADMIN SENT BACK] ${reason}`,
  entity_type: 'kpi',
  status: 'open',
})
```

### One-time data fix (migration)

```sql
UPDATE review_submissions
SET manager_rating = NULL, manager_score = NULL, manager_remarks = NULL,
    auditor_rating = NULL, auditor_score = NULL, auditor_remarks = NULL,
    management_rating = NULL, management_score = NULL, management_remarks = NULL
WHERE kpi_id IN (
  SELECT id FROM kpis WHERE status IN ('kra_set', 'self_review')
)
AND (manager_rating IS NOT NULL OR auditor_rating IS NOT NULL OR management_rating IS NOT NULL);
```


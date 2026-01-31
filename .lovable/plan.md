
## Summary

Update the database trigger `notify_on_kpi_status_change()` to handle ALL relevant status transitions correctly. The current trigger has multiple gaps where notifications are not being created because the code performs different transitions than the trigger expects.

## Analysis: Code vs Trigger Mismatches

| Transition | What Code Does | What Trigger Expects | Notification Affected |
|------------|----------------|---------------------|----------------------|
| Self-review submission | `kra_set` → `manager_check` | `kra_set` → `self_review` | Manager notification MISSING |
| Manager approval | Uses `sync_kpi_status_from_submission` trigger via `review_submissions` | `self_review` → `manager_check` | Auditor/Employee notification MAY WORK |
| Auditor forward | `manager_check` → `management_review` (AuditScorecard.tsx:167) | `manager_check` → `audit` | Management notification MISSING |
| Management approval | `management_review` → `approved` | `audit` → (none defined for management) | Correct but missing management transition |

## Complete List of Fixes

### 1. Self-Review Submission (kra_set → manager_check)

**Issue:** Code skips `self_review` status entirely, going straight to `manager_check`

**Fix:** Add handling for `kra_set` → `manager_check` transition to notify manager

### 2. Auditor Forward to Management (manager_check → management_review)

**Issue:** Code goes directly from `manager_check` to `management_review` (skipping `audit`), but trigger expects `manager_check` → `audit` first

**Fix:** Add handling for `manager_check` → `management_review` transition to notify management users

### 3. Management Approval (management_review → approved)

**Issue:** No trigger case for `management_review` → `approved` transition

**Fix:** Add specific handling for this transition to notify employee of final approval

### 4. Current "audit" status handling

Keep `manager_check` → `audit` and `audit` → `management_review` for backward compatibility (some workflows may use these intermediate states)

## Technical Details

### Updated Trigger Logic

```sql
CREATE OR REPLACE FUNCTION public.notify_on_kpi_status_change()
RETURNS trigger
...
BEGIN
  ...
  
  -- CASE 1: Self-review submission → Notify manager
  -- Handles BOTH kra_set→self_review AND kra_set→manager_check
  IF OLD.status = 'kra_set' AND (NEW.status = 'self_review' OR NEW.status = 'manager_check') THEN
    IF v_manager_id IS NOT NULL THEN
      INSERT INTO notifications (...) VALUES (v_manager_id, 'kpi_submitted', ...);
    END IF;
    
  -- CASE 2: Manager approved → Notify employee + auditors
  -- Handles self_review→manager_check (existing)
  ELSIF OLD.status = 'self_review' AND NEW.status = 'manager_check' THEN
    -- Notify employee + auditors (existing logic)
    
  -- CASE 3: Auditor forwarded → Notify management
  -- Handles BOTH manager_check→audit AND manager_check→management_review
  ELSIF (OLD.status = 'manager_check' AND NEW.status = 'audit') OR
        (OLD.status = 'manager_check' AND NEW.status = 'management_review') THEN
    INSERT INTO notifications (v_employee_id, 'kpi_approved', ...);  -- Notify employee
    INSERT INTO notifications (management users, 'kpi_ready_for_management', ...);  -- Notify management
    
  -- CASE 4: Audit stage approved → Notify employee + management
  ELSIF OLD.status = 'audit' AND NEW.status = 'management_review' THEN
    -- Existing logic for audit→management_review
    
  -- CASE 5: Management approved → Notify employee (final)
  -- Handles BOTH audit→approved AND management_review→approved
  ELSIF NEW.status = 'approved' AND (OLD.status = 'audit' OR OLD.status = 'management_review') THEN
    INSERT INTO notifications (v_employee_id, 'kpi_finalized', ...);
    
  END IF;
  
  RETURN NEW;
END;
```

## Migration File Changes

Create a new migration that updates the `notify_on_kpi_status_change` function with:

1. **Self-review to manager notification**: Handle `kra_set` → `manager_check` (in addition to existing `kra_set` → `self_review`)

2. **Auditor forward notification**: Handle `manager_check` → `management_review` (in addition to existing transitions)

3. **Management final approval**: Handle `management_review` → `approved` specifically

## Status Workflow Diagram

```
                 ┌──────────────────────────────────────────────────┐
                 │                                                  │
                 │  CODE FLOW (what actually happens)               │
                 │                                                  │
                 │  kra_set ───────────────► manager_check          │
                 │              skip                    │           │
                 │           self_review                │           │
                 │                                      ▼           │
                 │                            management_review     │
                 │                              skip audit          │
                 │                                      │           │
                 │                                      ▼           │
                 │                                  approved        │
                 │                                                  │
                 └──────────────────────────────────────────────────┘

Notifications need to fire on these transitions:
• kra_set → manager_check → notify manager
• manager_check → management_review → notify employee + management
• management_review → approved → notify employee (finalized)
```

## Files to Modify

| File | Action |
|------|--------|
| New migration SQL | Update `notify_on_kpi_status_change()` function |
| `DOCUMENTATION.md` | Document the correct notification triggers |

## Notifications Matrix (After Fix)

| Status Change | Recipient | Notification Type |
|--------------|-----------|-------------------|
| `kra_set` → `manager_check` | Reporting Manager | `kpi_submitted` - Self Review Submitted |
| `kra_set` → `self_review` | Reporting Manager | `kpi_submitted` - Self Review Submitted (backward compat) |
| `self_review` → `manager_check` | Employee + Auditors | `kpi_approved` + `kpi_ready_for_audit` |
| `manager_check` → `management_review` | Employee + Management | `kpi_approved` + `kpi_ready_for_management` |
| `manager_check` → `audit` | Employee + Auditors | `kpi_approved` + `kpi_ready_for_audit` (backward compat) |
| `audit` → `management_review` | Employee + Management | `kpi_approved` + `kpi_ready_for_management` |
| `management_review` → `approved` | Employee | `kpi_finalized` - KPI Finalized |
| Any → `approved` | Employee | `kpi_finalized` - KPI Finalized |

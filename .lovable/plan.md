
## Problem

When the system rolls over KRAs to a new period, the DB trigger `notify_on_kpi_created()` fires FOR EACH ROW on the `kpis` table. This creates one in-app notification per KPI, and the chained `send_email_on_notification()` trigger sends one email per notification. Result: if an employee has 6 KPIs, they receive 6 separate "New KRA Assigned to You" emails (as shown in the screenshot).

## Root Cause Chain

1. `auto-rollover-kpis` edge function inserts KPIs in batches into `kpis` table
2. `trigger_notify_kpi_created` (AFTER INSERT, FOR EACH ROW) fires `notify_on_kpi_created()` for each KPI
3. Each notification INSERT triggers `send_email_on_notification()` which sends an email

## Fix

### 1. Skip per-KPI notifications during rollover

Modify `notify_on_kpi_created()` to detect rollover-inserted KPIs (status = `kra_set` and no submission exists) and skip individual notifications when a rollover batch flag is active. The cleanest approach: the edge function will set a session variable (`SET LOCAL app.rollover_batch = 'true'`) before each batch insert, and the trigger will check for it.

### 2. Send consolidated notifications from the edge function

After all KPIs are inserted, the `auto-rollover-kpis` edge function will insert ONE notification per employee with a summary message, and invoke the email function once per employee with a consolidated email.

### Consolidated Email Text

**Subject:** `PMS - KRA/KPIs Rolled Over for {Month} {Year}`

**Body:**
```
Hi {Employee Name},

Your KRA/KPIs have been rolled over from {Source Month} {Source Year} to {Target Month} {Target Year}.

Summary:
- Total KPIs rolled over: {count}
- KRA(s): {comma-separated unique KRA names}

KPI Details:
1. {KRA Name} - {KPI Name} (Weightage: {X}%)
2. {KRA Name} - {KPI Name} (Weightage: {X}%)
...

Please review your assignments and begin your self-review when the period opens.

Regards,
HRMS - Performance Management System
```

### Consolidated In-App Notification

**Title:** `KRA/KPIs Rolled Over`
**Message:** `{count} KPI(s) have been rolled over from {Source Month} {Source Year} to {Target Month} {Target Year}. Total weightage: {X}%.`
**Type:** `kra_rollover`

### Changes

**Migration (SQL)**
- Alter `notify_on_kpi_created()` to check `current_setting('app.rollover_batch', true)`. If set to `'true'`, RETURN NEW without inserting a notification.

**`supabase/functions/auto-rollover-kpis/index.ts`**
- Before each batch insert: execute `SET LOCAL app.rollover_batch = 'true'` via raw SQL
- After all inserts complete: for each affected employee, insert ONE consolidated notification into `notifications` table
- Invoke `send-email-notification` once per employee with event_type `kra_rollover` containing the full KPI list

**`supabase/functions/send-email-notification/index.ts`**
- Add `kra_rollover` event type handler that renders the consolidated email template shown above

**`POLICY.md` / `DOCUMENTATION.md`**
- Document the rollover notification consolidation policy

**Test**
- Add test case verifying rollover produces exactly one notification per employee

### Risk & Impact

- **Data Impact:** None -- notification content only
- **Workflow Impact:** Employees receive one email instead of many; no functional change
- **Regression Risk:** Low -- the `SET LOCAL` is transaction-scoped, so normal KPI creation (non-rollover) is unaffected
- **Mitigation:** The `SET LOCAL` variable only persists within the current transaction; it cannot leak to other requests

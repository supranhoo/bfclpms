
# RCA and CAPA: Email Flow Broken for Trigger-Based Notifications (including KPI Submission)

## Root Cause Analysis

### Finding
The `kpi_submitted` in-app notifications ARE being created correctly (confirmed: recent entries exist in the `notifications` table). However, the database trigger `send_email_on_notification` that fires on notification INSERT to call the edge function is **silently failing**.

### Root Cause: Wrong schema and function signature for HTTP call

The trigger function `send_email_on_notification()` calls:
```text
extensions.http_post(url, body::text, headers::jsonb)
```

But the actual installed function is:
```text
net.http_post(url text, body jsonb, params jsonb, headers jsonb)
```

| Issue | Detail |
|---|---|
| Wrong schema | Trigger calls `extensions.http_post` but the function lives in `net.http_post` |
| Wrong body type | Trigger casts body to `::text`, but `net.http_post` expects `::jsonb` |
| Missing params argument | `net.http_post` requires a `params` argument (can be `'{}'::jsonb`) |
| Silent failure | The `EXCEPTION WHEN OTHERS` block catches the error and only raises a WARNING, so no visible error occurs |

This is why **all trigger-based emails** fail silently -- not just `kpi_submitted`, but also `manager_approved`, `manager_rejected`, `query_raised`, `kpi_ready_for_audit`, etc.

The only emails that work (`kra_batch_assigned`) are sent directly from the frontend via `supabase.functions.invoke()`, which bypasses the broken trigger entirely.

### Evidence
- `pg_extension` shows only `pg_net` is installed (no `http` extension)
- `pg_proc` confirms `http_post` exists only in the `net` schema
- `email_logs` table has zero entries for `kpi_submitted` despite many notifications existing
- The last email logs are for `kra_batch_assigned` (sent from frontend code, not the trigger)

---

## CAPA: Fix the trigger function to use the correct schema and signature

### Database Migration

Recreate `send_email_on_notification()` with the correct call:

Replace:
```text
PERFORM extensions.http_post(
  url := supabase_url || '/functions/v1/send-email-notification',
  body := jsonb_build_object(...)::text,
  headers := jsonb_build_object(...)::jsonb
);
```

With:
```text
PERFORM net.http_post(
  url := supabase_url || '/functions/v1/send-email-notification',
  body := jsonb_build_object(...),
  params := '{}'::jsonb,
  headers := jsonb_build_object(...)
);
```

Key changes:
1. Schema: `extensions` changed to `net`
2. Body: Remove `::text` cast -- pass as native `jsonb`
3. Add `params := '{}'::jsonb` argument
4. Keep all existing event type mappings and metadata extraction unchanged

### Files to Modify

| File | Change |
|---|---|
| Database migration (SQL) | Recreate `send_email_on_notification()` using `net.http_post()` with correct signature |
| `DOCUMENTATION.md` | Document the fix and correct HTTP function reference |

### Scope of Impact

This fix will restore email delivery for ALL trigger-based notification events:
- `kpi_submitted` (the reported issue)
- `manager_approved` / `manager_rejected`
- `kpi_ready_for_audit` / `kpi_ready_for_management`
- `final_approved`
- `query_raised` / `query_resolved` / `query_response_received`
- `admin_status_change` / `admin_data_entry` / `admin_data_override`
- `org_kpi_sent_back`
- `observation_raised` / `observation_reply` / `observation_resolved`

### Risk

Low -- this is a direct fix to the function call signature. No business logic changes. The trigger, event mappings, and edge function all remain identical.

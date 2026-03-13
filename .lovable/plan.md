

# RCA & CAPA: Email Pending Report Reminder to Data Owners

## Root Cause Analysis (RCA)

The feature was **never implemented**. The previous plan was approved but no code was written:

1. **No edge function exists**: `supabase/functions/send-pending-report-reminder/` does not exist
2. **No event type registered**: `org_kpi_pending_reminder` is absent from `EmailEventType`, `EMAIL_EVENTS`, `DEFAULT_TEMPLATES`, and `EVENT_STYLES`
3. **No UI trigger**: The OrgKpiDataEntry page has no "Send Reminder" button
4. **No config.toml entry**: No function declaration for the new edge function

The existing infrastructure (SMTP/Resend/Graph multi-provider, email logging, event toggle UI) is fully functional and ready to be extended.

## CAPA — Implementation Plan

### 1. Add Event Type to Email Settings Hook
**`src/hooks/useEmailNotificationSettings.ts`**
- Add `'org_kpi_pending_reminder'` to `EmailEventType` union

### 2. Add Event Toggle to Admin Email Settings UI
**`src/components/admin/EmailNotificationSettings.tsx`**
- Add entry to `EMAIL_EVENTS` array: `{ key: 'org_kpi_pending_reminder', label: 'Pending KPI Reminder', description: 'Send pending report to data owners with outstanding KPIs' }`

### 3. Add Template & Style to Existing Email Function
**`supabase/functions/send-email-notification/index.ts`**
- Add `org_kpi_pending_reminder` to `DEFAULT_TEMPLATES` with subject/body using `{{recipient_name}}`, `{{review_period}}`, `{{review_year}}`, `{{pending_count}}`, `{{pending_table}}`
- Add `org_kpi_pending_reminder` to `EVENT_STYLES` with appropriate color/emoji/title

### 4. Create New Edge Function
**`supabase/functions/send-pending-report-reminder/index.ts`**
- Accept `{ review_period, review_year }` from request body
- Validate caller (reuse auth pattern from send-email-notification)
- Read email settings from `system_settings` to check:
  - `email_notifications_enabled` is `'enabled'`
  - `org_kpi_pending_reminder` is in `email_notification_events`
  - Provider config (SMTP/Resend/Graph)
- Query `org_kpi_data_owners` joined with `profiles` (for owner name/email)
- Query `kpis` where `is_org_level = true` for the period
- Query `org_kpi_values` to determine which KPIs lack values
- Group pending KPIs by owner (using category_id + kra_name + kpi_name matching)
- For each owner with pending KPIs:
  - Build HTML table of pending KPIs (Category, KRA, KPI, Target, UOM, Scope, Days Pending)
  - Use the existing `send-email-notification` function's email sending pattern (read provider settings, call SMTP/Resend/Graph accordingly)
  - Log to `email_logs`
- Return `{ success: true, owners_notified: N, total_pending: M }`

### 5. Register Edge Function
**`supabase/config.toml`**
- Add `[functions.send-pending-report-reminder]` with `verify_jwt = false`

### 6. Add "Send Reminder" Button to Admin UI
**`src/pages/admin/OrgKpiDataEntry.tsx`**
- Add a `Mail` icon button next to the existing Pending Report button
- On click: invoke `supabase.functions.invoke('send-pending-report-reminder', { body: { review_period, review_year } })`
- Show toast with result count
- Only visible when `isAdmin`

### Files Created
- `supabase/functions/send-pending-report-reminder/index.ts`

### Files Modified
- `supabase/config.toml` — register function
- `src/hooks/useEmailNotificationSettings.ts` — add event type
- `src/components/admin/EmailNotificationSettings.tsx` — add toggle
- `supabase/functions/send-email-notification/index.ts` — add template + style
- `src/pages/admin/OrgKpiDataEntry.tsx` — add send button


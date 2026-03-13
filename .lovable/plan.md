
# CAPA: Email Pending Report Reminder to Data Owners — IMPLEMENTED ✅

## Root Cause
Feature was approved but never coded — no edge function, no event type, no UI trigger existed.

## Changes Made

### 1. `src/hooks/useEmailNotificationSettings.ts` — Added event type
- Added `'org_kpi_pending_reminder'` to `EmailEventType` union

### 2. `src/components/admin/EmailNotificationSettings.tsx` — Added toggle
- Added `org_kpi_pending_reminder` entry to `EMAIL_EVENTS` array so admins can enable/disable it

### 3. `supabase/functions/send-email-notification/index.ts` — Added template & style
- Added `org_kpi_pending_reminder` to `DEFAULT_TEMPLATES` with subject/body using `{{pending_count}}`, `{{pending_table}}`
- Added `org_kpi_pending_reminder` to `EVENT_STYLES` with orange color + ⏳ emoji

### 4. `supabase/functions/send-pending-report-reminder/index.ts` — New edge function
- Accepts `{ review_period, review_year }` from request body
- Validates admin JWT
- Checks email notifications enabled + event enabled in system_settings
- Queries org-level KPIs, existing values, and data owners
- Groups pending KPIs by data owner
- Sends personalized HTML email per owner via `send-email-notification` function
- Returns `{ success, owners_notified, total_pending }`

### 5. `supabase/config.toml` — Registered function
- Added `[functions.send-pending-report-reminder]` with `verify_jwt = false`

### 6. `src/pages/admin/OrgKpiDataEntry.tsx` — Added Send Reminder button
- Mail icon button next to Pending Report, admin-only
- Invokes edge function with current period/year
- Shows toast with result count

## Impact
- No schema changes, no RLS changes
- Leverages existing email infrastructure (multi-provider support)
- Admin-configurable via Email Notification Settings toggle

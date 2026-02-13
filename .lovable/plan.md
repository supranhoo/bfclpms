

# Feature: Email Sent Logs for Admin

## Overview

Create a persistent log of every email sent by the system, viewable by admins on a dedicated "Email Logs" page. This gives admins full visibility into what emails were sent, to whom, when, and with what content -- useful for auditing and troubleshooting.

## What Changes

### 1. New Database Table: `email_logs`

A new table to store every email sent (or failed):

| Column | Type | Description |
|--------|------|-------------|
| `id` | uuid (PK) | Auto-generated |
| `event_type` | text | e.g. `kra_batch_assigned`, `kpi_submitted` |
| `recipient_email` | text | Who received the email |
| `recipient_name` | text | Display name of recipient |
| `subject` | text | Email subject line |
| `status` | text | `sent`, `failed`, `skipped` |
| `error_message` | text (nullable) | Error details if failed |
| `provider` | text | `resend`, `smtp`, `microsoft_graph` |
| `metadata` | jsonb | Extra context (employee_name, kra_count, review_period, etc.) |
| `created_at` | timestamptz | When the email was sent |

RLS policy: Admin-only SELECT access. The edge function uses the service role key so INSERT bypasses RLS.

### 2. Edge Function Update: `send-email-notification/index.ts`

After every email send attempt (success, failure, or skip), insert a row into `email_logs` with the outcome. This covers:
- Successful sends (all 3 providers)
- Failed sends (captures error message)
- Skipped sends (notifications disabled or event type disabled)
- Test emails (marked with event_type `test`)

### 3. New Admin Page: `src/pages/admin/EmailLogs.tsx`

A table-based page showing all sent emails with:
- **Stats cards**: Total sent, failed, skipped, today's count
- **Filters**: Search by recipient, filter by event type, filter by status
- **Table columns**: Timestamp, Event Type, Recipient, Subject, Status, Provider
- **Expandable rows**: Click to see metadata details (employee name, KRA list, etc.)

### 4. Sidebar + Router Integration

- Add "Email Logs" menu item under the Admin section in the sidebar (with a `Mail` icon)
- Add route `/admin/email-logs` in `App.tsx`

### 5. Documentation

Update `DOCUMENTATION.md` with the new feature.

## Files Summary

| Action | File |
|--------|------|
| Migration | Create `email_logs` table + RLS policy |
| Edit | `supabase/functions/send-email-notification/index.ts` -- insert log row after each send |
| Create | `src/pages/admin/EmailLogs.tsx` -- admin UI page |
| Edit | `src/App.tsx` -- add route |
| Edit | `src/components/layout/AppSidebar.tsx` -- add sidebar menu item |
| Edit | `DOCUMENTATION.md` |

## User Experience

1. Admin navigates to **Email Logs** from the sidebar
2. Sees stats cards showing total/sent/failed/skipped counts
3. Can search by recipient email or name, filter by event type or status
4. Each row shows timestamp, event badge, recipient, subject, status (green/red/gray), and provider
5. Metadata column shows contextual details like review period and KRA count

## Technical Notes

- The edge function already uses the service role key, so INSERTs to `email_logs` work without RLS issues
- Logging is fire-and-forget within the edge function (a failed log insert should not break email delivery)
- No impact on existing email sending performance -- the INSERT happens after the send completes


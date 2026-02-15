

# Fix: Complete Email Logging Coverage

## Problem

The Email Logs page shows only 2 records because **test emails are not logged**. The edge function has a `logEmail()` helper but skips calling it for two code paths:

1. **Test emails** (`test: true`) -- lines 750-865: all 3 providers (Resend, SMTP, Microsoft Graph) return without logging
2. **SMTP connection tests** (`smtp_test: true`) -- lines 691-747: returns without logging

This means every time you send a test email from System Settings, it never appears in Email Logs. Additionally, if very few real notification events have triggered (only 2 KRA batch assignments on Feb 13), the page appears empty.

## Fix

Add `logEmail()` calls to both the test email and SMTP test code paths in the edge function so every email attempt is recorded.

### Changes in `supabase/functions/send-email-notification/index.ts`

**SMTP Test Path (around line 736-746):**
- On success: log with `event_type: 'test'`, `status: 'sent'`, `provider: 'smtp'`
- On failure: log with `status: 'failed'` and `error_message`

**Test Email Path (around line 838-864):**
- After successful SMTP send: add `logEmail()` call with `event_type: 'test'`, `status: 'sent'`, `provider: 'smtp'`
- After successful Graph send: add `logEmail()` call with `provider: 'microsoft_graph'`
- After successful Resend send: add `logEmail()` call with `provider: 'resend'`
- Wrap each in try/catch to also log failures

### Changes in `src/pages/admin/EmailLogs.tsx`

- Add `'test'` to the `EVENT_LABELS` map so test emails display as "Test Email" in the table

### Documentation

- Update `DOCUMENTATION.md` to note that all email sends (including tests) are now logged

## Files to Modify

| File | Change |
|---|---|
| `supabase/functions/send-email-notification/index.ts` | Add `logEmail()` calls to SMTP test and test email code paths (6 insertion points) |
| `src/pages/admin/EmailLogs.tsx` | Already has `test: 'Test Email'` in EVENT_LABELS -- no change needed |
| `DOCUMENTATION.md` | Document complete email logging coverage |

## Technical Details

For each test email success/failure, insert a log entry like:

```text
await logEmail({
  event_type: 'test',
  recipient_email: recipient_email,
  recipient_name: 'Test',
  subject: '[PMS] Test Email - Configuration Successful',
  status: 'sent',   // or 'failed'
  provider: 'smtp',  // or 'resend' or 'microsoft_graph'
  error_message: null, // or error.message on failure
  metadata: { test: true }
});
```

This ensures every email sent from the system -- whether triggered by a workflow event or manually from the admin settings -- appears in the Email Logs page.

## Risk Assessment
- No breaking changes; only adding log inserts to existing code paths
- The `logEmail` helper already uses try/catch internally so logging failures won't affect email delivery
- No database schema changes needed (email_logs table already exists with correct RLS)


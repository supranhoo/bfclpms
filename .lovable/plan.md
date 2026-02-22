

# Fix: Observation Email Placeholders Not Replaced

## Problem

The email still shows raw `{{observation_title}}` and `{{observation_type}}` placeholders. Edge function logs confirm the data arrives correctly in the request body, but the code never extracts or uses it.

## Root Cause

In `supabase/functions/send-email-notification/index.ts`:

1. **Line 1022-1028** -- The destructure of `body` does NOT include `observation_title` or `observation_type`
2. **Lines 1147-1174** -- The `placeholderData` object does NOT include these two fields

So `replacePlaceholders()` has no values to substitute, and the raw `{{observation_title}}` / `{{observation_type}}` text remains in the email.

## Fix

### File: `supabase/functions/send-email-notification/index.ts`

**Change 1 (line 1022-1028)**: Add `observation_title` and `observation_type` to the destructure:

```typescript
const { event_type, recipient_email, recipient_name, kpi_name, kra_name, actor_name, query_reason, resolution_notes, review_period, review_year,
  pip_start_date, pip_end_date, pip_reason, pip_outcome, pip_remarks,
  milestone_date, milestone_description, milestone_expected_outcome,
  send_back_reason, generated_password, login_email, employee_code, app_name,
  kra_list, kra_count, employee_name, total_weightage,
  old_email, new_email,
  observation_title, observation_type } = body;
```

**Change 2 (lines 1147-1174)**: Add both fields to `placeholderData`:

```typescript
const placeholderData: Record<string, string | number | undefined> = {
  // ... existing fields ...
  old_email,
  new_email,
  observation_title,
  observation_type,
};
```

### File: `DOCUMENTATION.md`

Version bump to 1.45.64 and document the fix.

## Summary

| File | Change |
|------|--------|
| `supabase/functions/send-email-notification/index.ts` | Add `observation_title` and `observation_type` to destructure and placeholderData |
| `DOCUMENTATION.md` | Version bump to 1.45.64 |

This is a 2-line fix. The DB triggers and `send_email_on_notification` function are already correct (fixed in the previous migration) -- the only gap is the edge function not extracting the fields it receives.



# Fix: Observation Reply Email Not Showing Actual Reply Content

## Root Cause

The code pipeline is correct — the DB trigger captures `reply_content` in metadata, `send_email_on_notification` passes it to the edge function, and the edge function's **default** template includes `{{reply_content}}`.

However, as visible in the screenshot, there is a **custom email template** saved in `system_settings` (key: `email_template_observation_reply`) that was created **before** the `{{reply_content}}` placeholder existed. This custom template overrides the default (lines 1152-1164 of the edge function). The saved custom template body is:

```
Hi {{recipient_name}},

{{actor_name}} has replied to an observation on {{kpi_name}}.

Observation: {{observation_title}}

Please check the observation thread for the latest update.
```

It is missing `{{reply_content}}`, `{{observation_type}}`, and `{{observation_description}}`.

## Fix

**Database migration** — Update the saved custom template in `system_settings` to include the new placeholders:

```sql
UPDATE system_settings
SET setting_value = jsonb_build_object(
  'subject', 'PMS - New Reply on Observation - {{kpi_name}}',
  'body', E'Hi {{recipient_name}},\n\n{{actor_name}} has replied to an observation on {{kpi_name}}:\n\nObservation: {{observation_title}}\nType: {{observation_type}}\nDescription: {{observation_description}}\n\nReply:\n{{reply_content}}\n\nPlease check the observation thread for the latest update.'
)
WHERE setting_key = 'email_template_observation_reply';
```

This is a single DB migration. No code changes needed — the edge function already handles all the placeholders correctly.

## Summary

| Layer | Status |
|---|---|
| DB trigger `notify_on_observation_reply` | Already correct — stores `reply_content` in metadata |
| DB trigger `send_email_on_notification` | Already correct — passes `reply_content` to edge function |
| Edge function default template | Already correct — includes `{{reply_content}}` |
| **Saved custom template in DB** | **Outdated — missing `{{reply_content}}`** ← the fix |

- 1 DB migration to update the stored custom template
- No code changes needed


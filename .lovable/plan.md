

# Add `{{observation_description}}` Placeholder to Observation Emails

## Problem

When an observation is raised, the description entered by the observer is captured in the `kpi_observations.description` column but never appears in the email. There is no `{{observation_description}}` placeholder in the templates or the data pipeline.

## Fix (3 layers, same pattern as title/type)

### Layer 1: DB Trigger -- `notify_on_observation_change`

Add `'observation_description', NEW.description` to every `jsonb_build_object` call in the trigger so the description is stored in the notification metadata.

### Layer 2: DB Function -- `send_email_on_notification`

Add `'observation_description', NEW.metadata->>'observation_description'` to the HTTP POST body so the value is sent to the edge function.

### Layer 3: Edge Function -- `send-email-notification/index.ts`

Three changes:

1. **Destructure**: Add `observation_description` to the body destructure (line ~1029).
2. **placeholderData**: Add `observation_description` to the object (line ~1176).
3. **Templates**: Add `Description: {{observation_description}}` line to the `observation_raised` default template (after the Type line).

### Layer 4: Documentation

Version bump `DOCUMENTATION.md` to 1.45.65.

## Files Changed

| File | Change |
|------|--------|
| New DB migration | Update `notify_on_observation_change` and `send_email_on_notification` to include `observation_description` |
| `supabase/functions/send-email-notification/index.ts` | Add `observation_description` to destructure, placeholderData, and default template |
| `DOCUMENTATION.md` | Version bump to 1.45.65 |


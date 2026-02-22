

# Fix: Observation Email Placeholders Not Replaced

## Problem

When an employee receives an observation email, the placeholders `{{observation_title}}` and `{{observation_type}}` appear as raw text instead of actual values. The email shows:

```
Observation: {{observation_title}}
Type: {{observation_type}}
```

## Root Cause (3-layer gap)

The observation email pipeline has gaps at every layer:

### Layer 1: DB Triggers (metadata incomplete)
The triggers `notify_on_observation_change` and `notify_on_observation_reply` insert notifications but do NOT include `observation_title` or `observation_type` in the `metadata` JSONB field. They only store `observation_id`.

### Layer 2: DB Function `send_email_on_notification` (fields not extracted)
This function reads from `NEW.metadata` to build the email request body, but it never extracts `observation_title` or `observation_type` -- so these values are never sent to the edge function.

### Layer 3: Edge Function `DEFAULT_TEMPLATES` (templates missing)
The edge function has no default templates for `observation_raised`, `observation_reply`, or `observation_resolved`. It also has no entries in `EVENT_STYLES` for these event types, resulting in a generic email header.

## Fix Plan

### 1. Database Migration -- Update both DB triggers to include observation metadata

**`notify_on_observation_change`**: Add `observation_title` and `observation_type` to the `metadata` JSONB:
```sql
jsonb_build_object(
  'observation_id', NEW.id,
  'observation_title', NEW.title,
  'observation_type', NEW.observation_type
)
```

**`notify_on_observation_reply`**: Add `observation_title` to the `metadata` JSONB:
```sql
jsonb_build_object(
  'observation_id', NEW.observation_id,
  'reply_id', NEW.id,
  'observation_title', v_obs_title
)
```

### 2. Database Migration -- Update `send_email_on_notification` to pass observation fields

Add `observation_title` and `observation_type` to the `jsonb_build_object` call in the HTTP POST body:
```sql
'observation_title', NEW.metadata->>'observation_title',
'observation_type', NEW.metadata->>'observation_type'
```

### 3. Edge Function -- Add missing templates and styles

**Add to `DEFAULT_TEMPLATES`** (3 new entries):
- `observation_raised` -- with `{{observation_title}}` and `{{observation_type}}` placeholders
- `observation_reply` -- with `{{observation_title}}` placeholder
- `observation_resolved` -- with `{{observation_title}}` placeholder

**Add to `EVENT_STYLES`** (3 new entries):
- `observation_raised` -- orange, eye emoji
- `observation_reply` -- purple, speech bubble emoji
- `observation_resolved` -- green, checkmark emoji

### 4. Update `DOCUMENTATION.md`

Version bump to 1.45.63 and document the fix.

## Files Changed

| File | Change |
|------|--------|
| DB migration (new) | Update 3 DB functions: `notify_on_observation_change`, `notify_on_observation_reply`, `send_email_on_notification` |
| `supabase/functions/send-email-notification/index.ts` | Add 3 default templates + 3 event styles for observation events |
| `DOCUMENTATION.md` | Version bump and changelog |


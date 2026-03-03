
# ✅ COMPLETED: Fix Observation Reply Email
# Fix: Observation Reply Email — Show Actual Reply & Original Observation

## Problem

The observation reply email currently shows the raw KPI name (which includes multi-line descriptions, formulas, and scoring logic) instead of showing:
1. **The actual reply content** (what the person wrote)
2. **The original observation** (title, type, description)

The email is nearly unreadable because `kpi_name` contains the full KPI specification text.

## Root Cause

The DB trigger `notify_on_observation_reply` only stores `observation_id`, `reply_id`, and `observation_title` in the notification metadata. It does **not** capture:
- `reply_content` (the actual reply text from `kpi_observation_replies.content`)
- `observation_type` (positive/concern/neutral)
- `observation_description` (the original observation body)

The email template also lacks placeholders for `{{reply_content}}` and `{{observation_description}}`.

Additionally, `kpi_name` is passed untruncated — should be truncated to the first line (before any newline or colon) per existing UX convention.

## Fix Plan

### 1. Database Migration — Update `notify_on_observation_reply` trigger

Add lookups for `reply_content`, `observation_type`, and `observation_description`, and include them in the notification `metadata`:

```sql
-- Add to DECLARE block:
v_reply_content text;
v_obs_type text;
v_obs_description text;

-- Fetch reply content:
v_reply_content := NEW.content;

-- Fetch observation details:
SELECT o.created_by, o.kpi_id, o.title, o.observation_type, o.description
INTO v_obs_creator, v_kpi_id, v_obs_title, v_obs_type, v_obs_description
FROM kpi_observations o WHERE o.id = NEW.observation_id;

-- Truncate kpi_name to first line (≤80 chars):
v_kpi_name := LEFT(SPLIT_PART(v_kpi_name, E'\n', 1), 80);

-- Add to metadata jsonb_build_object:
'reply_content', v_reply_content,
'observation_type', v_obs_type,
'observation_description', v_obs_description
```

### 2. Database Migration — Update `send_email_on_notification` trigger

Pass the new metadata fields to the edge function payload:

```sql
'reply_content', NEW.metadata->>'reply_content',
```

Also truncate `kpi_name` before passing:

```sql
'kpi_name', LEFT(SPLIT_PART(kpi_record.kpi_name, E'\n', 1), 80),
```

### 3. Edge Function — Update `observation_reply` email template

**File: `supabase/functions/send-email-notification/index.ts`**

Update the default template from:

```
{{actor_name}} has replied to an observation on your KPI.

KPI: {{kpi_name}}
Observation: {{observation_title}}

Please log in to view the reply and continue the conversation.
```

To:

```
{{actor_name}} has replied to an observation on {{kpi_name}} .:

Observation: {{observation_title}}
Type: {{observation_type}}
Description: {{observation_description}}

Reply: {{reply_content}}

Please check the observation thread for the latest update.
```

Also add `reply_content` to the placeholder data map so `replacePlaceholders` can substitute it.

### 4. Edge Function — Truncate `kpi_name` for all observation events

In the edge function handler, truncate `kpi_name` at the first newline/colon for observation-type events to prevent wall-of-text in emails. This applies to `observation_raised`, `observation_reply`, `observation_resolved`, and `observation_mention`.

## Summary

| Layer | Change |
|---|---|
| DB trigger `notify_on_observation_reply` | Capture `reply_content`, `observation_type`, `observation_description` in metadata; truncate `kpi_name` |
| DB trigger `send_email_on_notification` | Pass `reply_content` to edge function; truncate `kpi_name` |
| Edge function template | Show reply content, observation details; use truncated KPI name |

- 2 DB migrations (can be combined into 1)
- 1 edge function file update
- No frontend changes needed


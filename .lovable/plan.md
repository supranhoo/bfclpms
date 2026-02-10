
# Observation Activity Notifications

## Overview

Currently, observation activities (creating an observation, replying, resolving) produce **no notifications**. This plan adds a database trigger that automatically creates in-app notifications (which also trigger email via the existing `send_email_on_notification` pipeline) for all three observation events.

## Notification Events

| Activity | Who Gets Notified | Notification Type |
|---|---|---|
| **New observation raised** on a KPI | The KPI owner (employee) | `observation_raised` |
| **Reply posted** on an observation | The observation creator + KPI owner (excluding the replier) | `observation_reply` |
| **Observation resolved** | The KPI owner + all reply participants (excluding the resolver) | `observation_resolved` |

## Implementation

### 1. Database Migration -- Trigger on `kpi_observations`

Create a trigger function `notify_on_observation_change()` that fires on:
- **INSERT** on `kpi_observations` -- new observation raised
- **UPDATE** on `kpi_observations` where `status` changes to `'resolved'` -- observation resolved

The function will:
- Look up the KPI's `employee_id` from the `kpis` table
- Look up the observer's name from `profiles`
- Insert a notification row for the KPI owner (if they're not the one who created/resolved it)
- For resolved: also notify the observation creator if different from the KPI owner and resolver

### 2. Database Migration -- Trigger on `kpi_observation_replies`

Create a trigger function `notify_on_observation_reply()` that fires on:
- **INSERT** on `kpi_observation_replies` -- new reply posted

The function will:
- Look up the parent observation's `created_by` and `kpi_id`
- Look up the KPI's `employee_id`
- Look up the replier's name from `profiles`
- Insert notifications for:
  - The observation creator (if not the replier)
  - The KPI owner (if not the replier and not the observation creator)

### 3. Email Integration

Add the three new types (`observation_raised`, `observation_reply`, `observation_resolved`) to the `send_email_on_notification()` function's type mapping so they trigger emails through the existing pipeline.

### 4. Documentation

Update `DOCUMENTATION.md` to list the new observation notification types.

## Technical Details

### Trigger function: `notify_on_observation_change()`

```sql
CREATE OR REPLACE FUNCTION public.notify_on_observation_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_kpi_owner uuid;
  v_observer_name text;
  v_kpi_name text;
BEGIN
  -- Get KPI owner and name
  SELECT k.employee_id, k.kpi_name INTO v_kpi_owner, v_kpi_name
  FROM kpis k WHERE k.id = NEW.kpi_id;

  SELECT COALESCE(p.full_name, p.email) INTO v_observer_name
  FROM profiles p WHERE p.id = NEW.created_by;

  IF TG_OP = 'INSERT' THEN
    -- New observation: notify KPI owner
    IF v_kpi_owner IS NOT NULL AND v_kpi_owner != NEW.created_by THEN
      INSERT INTO notifications (user_id, type, title, message, kpi_id, related_user_id, metadata)
      VALUES (v_kpi_owner, 'observation_raised',
        'New Observation on ' || v_kpi_name,
        v_observer_name || ' raised a ' || NEW.observation_type || ' observation: ' || NEW.title,
        NEW.kpi_id, NEW.created_by,
        jsonb_build_object('observation_id', NEW.id));
    END IF;

  ELSIF TG_OP = 'UPDATE' AND OLD.status != 'resolved' AND NEW.status = 'resolved' THEN
    -- Resolved: notify KPI owner and observation creator
    IF v_kpi_owner IS NOT NULL AND v_kpi_owner != NEW.created_by THEN
      INSERT INTO notifications (user_id, type, title, message, kpi_id, related_user_id, metadata)
      VALUES (v_kpi_owner, 'observation_resolved',
        'Observation Resolved on ' || v_kpi_name,
        'Observation "' || NEW.title || '" has been resolved',
        NEW.kpi_id, NEW.created_by,
        jsonb_build_object('observation_id', NEW.id));
    END IF;
    -- Also notify the creator if they're different from the resolver (who triggered the update)
    -- (creator = NEW.created_by, resolver = current user via auth.uid())
  END IF;

  RETURN NEW;
END;
$$;
```

### Trigger function: `notify_on_observation_reply()`

```sql
CREATE OR REPLACE FUNCTION public.notify_on_observation_reply()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_obs_creator uuid;
  v_kpi_id uuid;
  v_kpi_owner uuid;
  v_kpi_name text;
  v_replier_name text;
  v_obs_title text;
BEGIN
  -- Get observation details
  SELECT o.created_by, o.kpi_id, o.title INTO v_obs_creator, v_kpi_id, v_obs_title
  FROM kpi_observations o WHERE o.id = NEW.observation_id;

  -- Get KPI owner
  SELECT k.employee_id, k.kpi_name INTO v_kpi_owner, v_kpi_name
  FROM kpis k WHERE k.id = v_kpi_id;

  -- Get replier name
  SELECT COALESCE(p.full_name, p.email) INTO v_replier_name
  FROM profiles p WHERE p.id = NEW.reply_by;

  -- Notify observation creator (if not the replier)
  IF v_obs_creator IS NOT NULL AND v_obs_creator != NEW.reply_by THEN
    INSERT INTO notifications (user_id, type, title, message, kpi_id, related_user_id, metadata)
    VALUES (v_obs_creator, 'observation_reply',
      'New Reply on Observation',
      v_replier_name || ' replied to observation "' || v_obs_title || '" on ' || v_kpi_name,
      v_kpi_id, NEW.reply_by,
      jsonb_build_object('observation_id', NEW.observation_id, 'reply_id', NEW.id));
  END IF;

  -- Notify KPI owner (if different from both replier and obs creator)
  IF v_kpi_owner IS NOT NULL AND v_kpi_owner != NEW.reply_by AND v_kpi_owner != v_obs_creator THEN
    INSERT INTO notifications (user_id, type, title, message, kpi_id, related_user_id, metadata)
    VALUES (v_kpi_owner, 'observation_reply',
      'New Reply on Observation',
      v_replier_name || ' replied to observation "' || v_obs_title || '" on ' || v_kpi_name,
      v_kpi_id, NEW.reply_by,
      jsonb_build_object('observation_id', NEW.observation_id, 'reply_id', NEW.id));
  END IF;

  RETURN NEW;
END;
$$;
```

### Email type mapping update

Add to `send_email_on_notification()`:
```sql
WHEN 'observation_raised' THEN 'observation_raised'
WHEN 'observation_reply' THEN 'observation_reply'
WHEN 'observation_resolved' THEN 'observation_resolved'
```

### Files changed
- **New migration SQL** -- two trigger functions + three triggers + email mapping update
- **`DOCUMENTATION.md`** -- add observation notification types to the notification event list

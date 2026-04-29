---
name: Safety SLA & Notifications Engine
description: Phase 1.D — Safety in-app notifications, idempotent SLA escalation engine, pg_cron schedule, and realtime bell
type: feature
---
**Notifications**
- Table `safety_notifications` (recipient_id, incident_id, kind, title, body, payload, is_read). RLS: users read/update own only; admins/safety_head may insert manually. All automated inserts go through `enqueue_safety_notification(...)` SECURITY DEFINER.
- Realtime: published on `supabase_realtime`, REPLICA IDENTITY FULL. Hook `useSafetyNotifications` subscribes filtered by `recipient_id=eq.<uid>`.

**Triggers (auto-notify)**
- `trg_safety_incident_after_insert` → notifies all admins+safety_head+safety_officer + reporter on submit.
- `trg_safety_incident_after_status_change` → AFTER UPDATE OF status, assigned_to → notifies reporter and assignee with `incident_assigned` / `stage_advanced` / `incident_closed`.

**SLA Escalation Engine**
- `safety_sla_escalations` table with UNIQUE(incident_id, level) for idempotency. `level` ∈ {amber,red}.
- `run_safety_sla_escalations()` SECURITY DEFINER scans `safety_incidents_with_sla` view (Phase 1.B) and escalates open incidents whose `sla_state` is amber/red. Recipients: assignee + safety_head + admin + bu_head (red only).
- Edge fn `check-safety-sla` calls the RPC; authorizes service-role calls (cron) OR safety_head/admin user JWTs.
- pg_cron job `check-safety-sla-every-5min` posts to the edge fn every 5 minutes.

**UI**
- `SafetyNotificationBell` in `SafetyHeader` — popover with unread badge, click navigates to incident, mark-all action.
- `/safety/settings/sla` (`SafetySlaMonitor`) — escalation history table + "Run now" button.

**Invariants**
- Never insert into `safety_notifications` directly from app code; always via the trigger paths or `enqueue_safety_notification`.
- Never bypass `safety_sla_escalations` UNIQUE — duplicate-blocking is the source of truth, not app logic.
- Bell + escalation list cache keys are under `['safety',...]` only (POLICY §110 isolation).

---
name: Orphan Incident Revival
description: Safety Admin/Head reassign flow for orphaned incidents via revive_orphaned_safety_incident RPC; FSM guard bypass scoped to session flag
type: feature
---

- Orphaned incidents (`status='orphaned'`) cannot transition via `transition_safety_incident` — that path is sequential-only.
- Revival uses RPC `public.revive_orphaned_safety_incident(p_incident_id, p_assigned_to, p_notes)`.
  - SECURITY DEFINER; allowed roles: `admin` and `safety_head` (Safety enum).
  - Sets session-local `app.safety_fsm_bypass = 'orphan_revival'` so `safety_incident_fsm_guard` permits the single `orphaned → assigned` write.
  - Inserts a `safety_incident_timeline` row attributed to `auth.uid()`.
- UI: `OrphanIncidentDialog`. List rows whose status is `orphaned` open the dialog instead of navigating to detail. Detail page shows a banner with "Revive & Reassign".
- Never widen the bypass flag values — add a separate, named flag for any new exception path and update the guard.
- See ADR-089.
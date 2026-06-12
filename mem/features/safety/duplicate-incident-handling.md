---
name: Safety Duplicate Incident Handling
description: BU Head marks an open incident as duplicate of a master; Safety Head closes via dedicated RPC; SLA clock keeps ticking until closure
type: feature
---

## Phase 2 — `safety_incidents` duplicate workflow

- Columns: `duplicate_of_id` (self FK), `marked_duplicate_by`, `marked_duplicate_at`, `duplicate_remarks`. CHECK blocks self-link.
- **Only BU Head over the incident's `business_unit_id`** (or `admin`) may call `mark_incident_duplicate(incident_id, master_id, remarks)`. Master must be open and not itself a duplicate. Remarks required. Status is NOT changed at marking — SLA clock keeps ticking. Audit: `incident.marked_duplicate`.
- **Only `safety_head` / `admin`** may call `close_duplicate_incident(incident_id, notes)`. Requires `marked_duplicate_at IS NOT NULL`. Bypasses verification-evidence checks; sets status to `closed`, stamps `closed_at` / `closed_by`, writes timeline + `incident.duplicate_closed` audit.
- Both RPCs are SECURITY DEFINER; UI guards (`useMySafetyRoleRows`) are advisory only — the RPCs re-validate.
- List badge: rows with `duplicate_of_id IS NOT NULL` show "Dup pending" (open) or "Duplicate" (closed) next to the status badge. Detail page shows an amber banner with master link + remarks.
- All new columns auto-covered by `public.get_backup_table_order()`; no denylist change.
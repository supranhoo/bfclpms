# Configurable Incident Types & Per-Type Severities

## Goal
Remove the hardcoded `safety_incident_type` and `safety_incident_severity` enums from the user-facing flow. Admins define both Types and the Severities under each Type. New incidents pick Type → then a Severity that belongs to that Type. SLA and routing rules are re-keyed to the new severity rows. Historical incidents keep their original labels via snapshots.

## What changes for the user

### Admin → Safety Settings → Incident Types (new page)
- Table of incident types: `Name`, `Active`, `# Severities`, actions.
- Add / Edit dialog: Name, Description (optional), Active toggle.
- Each row expands into a Severities manager:
  - Add / Edit / Delete / Reorder severities (drag handle + up/down).
  - Fields per severity: Label, Code (auto from label, editable), Sort order, Active.
  - Deleting a severity that is referenced by historical incidents soft-deactivates it instead of hard delete (toast explains why).

### Incident creation form (`SafetyIncidentNew`)
- "Type" dropdown lists active configured Incident Types.
- "Severity" dropdown becomes empty + disabled until a Type is chosen, then lists only that Type's active severities.
- Selected Type & Severity labels are snapshotted onto the incident at submit time.

### Incident list & detail
- Render the snapshot label (`type_label_snapshot`, `severity_label_snapshot`) so renames/deletes never change historical rows. Falls back to the legacy enum value for incidents created before this change.

### Admin → SLA Rules tab
- Severity selector becomes cascading: pick Type → pick Severity (from that type's list). Existing rules are migrated to point at seeded severity ids.

## Technical details

### New tables
```text
safety_incident_types
  id uuid pk, name text unique, code text unique, description text,
  is_active bool, sort_order int, created_at, updated_at

safety_incident_severities
  id uuid pk, incident_type_id uuid fk -> safety_incident_types(id),
  label text, code text, sort_order int, is_active bool,
  created_at, updated_at,
  unique(incident_type_id, code)
```
Both get RLS: read = any authenticated safety user; write = Safety Admin / Safety Head (via `has_safety_role`). GRANTs to authenticated + service_role.

### Schema migration on `safety_incidents`
- Add `incident_type_id uuid`, `severity_id uuid` (nullable, FK with `ON DELETE SET NULL`).
- Add `type_label_snapshot text`, `severity_label_snapshot text`.
- Keep existing `incident_type` and `severity` enum columns for one release (read-only historical) — populated via trigger when only the new ids are supplied, so nothing reading the old columns breaks.

### Data seeding (idempotent)
- Seed 6 incident types from current enum values (`near_miss`, `unsafe_act`, `unsafe_condition`, `accident`, `property_damage`, `environmental`) with their existing labels.
- Seed the 4 default severities (`low`, `medium`, `high`, `critical`) under every seeded type so historical incidents map cleanly.
- Backfill `safety_incidents.incident_type_id` / `severity_id` / snapshots from the existing enum values.

### SLA + routing migration
- `safety_incident_sla_rules` and `safety_severity_sla`: add `severity_id uuid` FK. Backfill by joining `(incident_type, severity)` → seeded rows. Keep the old enum columns for one release; new admin writes only the id.
- `safety_incident_routing_rules`: add `incident_type_id` + `severity_id` FKs, backfill the same way.

### RPC update
- `report_safety_incident(p_payload jsonb)` accepts `incident_type_id` + `severity_id` (preferred). Validates the severity belongs to the chosen type, writes snapshots, and back-fills the legacy enum columns from the resolved codes for one release.

### Frontend
- New hooks: `useIncidentTypes`, `useUpsertIncidentType`, `useDeleteIncidentType`, `useIncidentSeverities(typeId)`, `useUpsertIncidentSeverity`, `useReorderIncidentSeverities`, `useDeleteIncidentSeverity`.
- New page: `src/pages/safety/SafetyIncidentTypes.tsx` + child component `IncidentTypeSeverityManager.tsx`.
- New route `/safety/settings/incident-types` + tile in `SafetySettings`.
- `SafetyIncidentNew`: replace enum-driven selects with the new hooks; cascade severity on type change; pass ids to the RPC.
- `SafetyIncidents`, `SafetyIncidentDetail`, dashboard widgets, analytics: render `severity_label_snapshot ?? severity` and `type_label_snapshot ?? incident_type`.
- `safetyIncidents.ts`: keep enum labels for legacy fallback only; remove from the new-incident form.

### Backup & RLS
- New tables flow into `public.get_backup_table_order()` automatically — nothing to allowlist.
- RLS policies follow the Safety RBAC: read for any signed-in safety user, write for Safety Admin / Safety Head.

### Tests
- DB: RPC rejects a severity that doesn't belong to the chosen type.
- DB: deactivating a referenced severity is allowed; deleting one that's referenced raises a clear error (FK ON DELETE SET NULL would orphan history, so we block hard-delete in the API).
- TS: snapshot fallback renders the right label for legacy rows.
- TS: cascade resets severity when type changes.

## Rollback
- Migration is additive (new tables, new nullable columns). Reverting = drop the new tables/columns and switch the form back to the enum imports — historical data untouched.

## Out of scope
- Dropping the old `safety_incident_type` / `safety_incident_severity` enums (deferred to a follow-up once all read paths use the snapshot/id columns in production).
- Bulk import of severities (admins create them manually for now).

---
name: Safety Incident UX v2 (Governance Phase 3)
description: Flag-gated v2 incident detail layout — stage-aware header, day-grouped timeline, structured RCA panel. UI-only, RPC contract preserved.
type: feature
---
## Flag
- `safety_settings.ui_incident_v2` (boolean JSONB). Default `false`. Flip via existing Safety Settings JSON editor (admin / safety_head).
- `safety_settings.incident_stage_copy` (JSONB keyed by `safety_incidents.status` → `{ title, hint }`). Missing keys fall back to `SAFETY_STATUS_LABELS`.

## Files
- `src/lib/incidentTimelineGrouping.ts` — pure day grouping + collapse-by-age helper.
- `src/components/safety/IncidentStageHeader.tsx` — stage-aware header reading `incident_stage_copy`.
- `src/components/safety/IncidentRcaPanel.tsx` — read-only structured visualization of existing `rca_summary` / `capa_summary` / `verification_notes`.
- `src/components/safety/IncidentTimeline.tsx` — extended with optional `grouped` prop (additive, default `false`).
- `src/pages/safety/SafetyIncidentDetail.tsx` — reads flag and conditionally renders header + RCA panel + grouped timeline.

## Invariants
- New v2 files MUST NOT call `.from('safety_incidents').update(...)`, `.delete(...)`, or `.rpc('transition_safety_incident', ...)`. Enforced by `src/test/safety/incidentUxV2NoDirectWrites.test.ts` — add any new v2 file to its `V2_FILES` list.
- All writes still flow through `StageActionPanel` → `transition_safety_incident` RPC. Phase 3 adds zero new mutation paths.
- No new query keys; reuses `['safety','incident', id, 'timeline']` etc.

## Rollback
- Set `ui_incident_v2 = false` via the Safety Settings JSON editor → instant revert to legacy renderer. No migration.

## Phase gate
- Phase 4+ (offline/evidence, emergency, admin/import, analytics polish, stabilization) remain blocked per `docs/safety-integration-governance.md`.
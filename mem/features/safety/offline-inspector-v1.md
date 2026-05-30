---
name: Safety Offline Queue Inspector (Governance Phase 4)
description: Flag-gated read-mostly sheet exposing the IndexedDB offline incident queue with Retry-all and per-item Discard. UI-only, queue contract preserved.
type: feature
---
## Flag
- `safety_settings.ui_offline_inspector_v1` (boolean JSONB row). Default `false`. Flip via the existing Safety Settings JSON editor (admin / safety_head).
- Reads via row form: `settings.find(r => r.key === 'ui_offline_inspector_v1')?.value === true`.

## Files
- `src/components/safety/OfflineQueueInspector.tsx` — Sheet with list + Retry all + per-item Discard. Render cap = 200.
- `src/components/safety/SafetyOfflineBadge.tsx` — when flag ON, badge button becomes a `Sheet` trigger; legacy click-to-flush preserved when flag OFF.
- `src/test/safety/offlineInspectorNoNewWriters.test.ts` — regex guard for the contract.

## Allowed helpers (pre-existing, NOT new writers)
- `listPendingIncidents()` — read.
- `deletePendingIncident()` — pre-existing, used by the sync engine on success; reused for Discard.
- `useSafetyOfflineSync().flushNow()` — pre-existing retry engine; reused for Retry all.

## Invariants
- Phase 4 files MUST NOT call `from('safety_incident_evidence').insert`, `from('safety-media').upload`, assign `client_submission_id`, write to `safety_incidents`, call `transition_safety_incident` RPC, call `enqueuePendingIncident`, or call `recordPendingFailure`. Enforced by `offlineInspectorNoNewWriters.test.ts` — add any new Phase 4 file to `PHASE4_FILES`.
- Queue contract (`safety_offline_v1` IDB, `pending_incidents` store, `client_submission_id` key, UNIQUE(reporter_id, client_submission_id) server guard) is frozen.
- Upload pipeline `safetyIncidentSubmit.ts` and `useSafetyOfflineSync.flushNow` sync engine internals are frozen.

## Rollback
- Set `ui_offline_inspector_v1 = false` via Safety Settings JSON editor → instant revert to legacy click-to-flush badge. No migration.

## Phase gate
- Phase 5+ (emergency overlay, admin/import, analytics polish, stabilization) remain blocked per `docs/safety-integration-governance.md`.
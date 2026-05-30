---
name: Safety Offline Queue Inspector (Governance Phase 4 + 9)
description: Flag-gated inspector with Retry-all, per-item Discard, per-item Retry, error-class badges, attempt-severity colouring, and All/Failed/Pending filter pills. UI-only, queue contract preserved.
type: feature
---
## Flag
- **Phase 4:** `safety_settings.ui_offline_inspector_v1` (boolean JSONB). Default `false`. Gates the Sheet itself (via the offline badge).
- **Phase 9:** `safety_settings.ui_offline_inspector_retry_v2` (boolean JSONB). Default `false`. Gates per-item Retry, error-class badges, attempt-severity colouring, filter pills, and the `ConfirmDestructiveDialog` confirmation on Discard.
- Read pattern: `settings.find(r => r.key === '<flag>')?.value === true`.

## Files
- `src/components/safety/OfflineQueueInspector.tsx` — Sheet with list, Retry all, per-item Discard, (v2) per-item Retry, error-class badges, filter pills, ConfirmDestructiveDialog. Render cap = 200.
- `src/components/safety/SafetyOfflineBadge.tsx` — when flag ON, badge button becomes a `Sheet` trigger; legacy click-to-flush preserved when flag OFF.
- `src/lib/safetyOfflineErrorClassify.ts` — pure helper: `classifyQueueError(lastError, attempts)` → `{cls, label, hint}`; `attemptSeverity(n)` → fresh/warning/critical. No I/O, no imports.
- `src/hooks/useSafetyOfflineSync.ts` — exports new `flushOne(id)` (reuses the same `submitSafetyIncident` + `deletePendingIncident` + `recordPendingFailure` triple as `flushNow`).
- `src/test/safety/offlineInspectorNoNewWriters.test.ts` — regex guard for the contract.
- `src/test/safety/safetyOfflineErrorClassify.test.ts` — classifier + severity unit tests.

## Allowed helpers (pre-existing, NOT new writers)
- `listPendingIncidents()` — read.
- `deletePendingIncident()` — pre-existing, used by the sync engine on success; reused for Discard.
- `useSafetyOfflineSync().flushNow()` — pre-existing retry engine; reused for Retry all.
- `useSafetyOfflineSync().flushOne(id)` — Phase 9 single-item retry. Same pipeline as `flushNow`, just filters to one id.

## Invariants
- Phase 4/9 files MUST NOT call `from('safety_incident_evidence').insert`, `from('safety-media').upload`, assign `client_submission_id`, write to `safety_incidents`, call `transition_safety_incident` RPC, call `enqueuePendingIncident`, or call `recordPendingFailure`. Enforced by `offlineInspectorNoNewWriters.test.ts` — add any new file to `PHASE4_FILES`.
- Queue contract (`safety_offline_v1` IDB, `pending_incidents` store, `client_submission_id` key, UNIQUE(reporter_id, client_submission_id) server guard) is frozen.
- Upload pipeline `safetyIncidentSubmit.ts` and `useSafetyOfflineSync.flushNow` sync engine internals are frozen.
- Severity thresholds: fresh ≤2 attempts, warning 3–5, critical ≥6. Conflict-class rows disable Retry (server already accepted the same idempotency key).

## Rollback
- Set `ui_offline_inspector_retry_v2 = false` → instant revert to Phase 4 inspector (Retry-all + single-tap Discard).
- Set `ui_offline_inspector_v1 = false` → instant revert to legacy click-to-flush badge. No migration in either case.

## Phase gate
- Phase 6 (admin/import) and Phase 7 (analytics polish) remain blocked per `docs/safety-integration-governance.md`. Docs: DOCUMENTATION.md v2.66.13.24 · POLICY.md §Phase9-Safety.
Phase 14: Enable Retry v2 + QA
================================

## Status
Both flags (`ui_offline_inspector_v1` and `ui_offline_inspector_retry_v2`) already `true` in production. Code-path QA performed (see DOCUMENTATION.md v2.66.13.29 and POLICY §Phase14-Safety).

## QA Sign-Off (2026-05-30)
- `OfflineQueueInspector` v2 surface gated correctly behind `ui_offline_inspector_retry_v2`.
- `flushOne(id)` reuses existing writer triple — zero new contracts (enforced by `offlineInspectorNoNewWriters.test.ts`).
- All 43 safety tests pass; build passes.
- Sheet not visually opened — BFCL tenant has `pendingCount === 0`, so the offline badge is hidden by design.
- Rollback path: set `ui_offline_inspector_retry_v2 = false`.
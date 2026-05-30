# Phase 4 — Offline Sync & Evidence UX

Per `docs/safety-integration-governance.md` §Phase 4 (MEDIUM/HIGH, human-approval gated). **UI-only.** Zero changes to queue contract, idempotency key, upload pipeline, or schema.

## 1. Assumptions
- `client_submission_id` remains the sole idempotency key. `safetyOfflineQueue.ts` (IndexedDB) and `useSafetyOfflineSync.ts` remain the only writers.
- `safety-media` bucket + `safety_incident_evidence` table contract is frozen.
- Phase 3 V2 flag (`ui_incident_v2`) is live and stable.
- Two prototype-approved Phase 4 items from `docs/safety/phase0/idempotency-and-offline.md`: **(a)** read-only queue inspector sheet, **(b)** per-file evidence retry UI.

## 2. Clarifications
None blocking. Say so before approval if you want to defer (b) and ship only (a) first.

## 3. Risk & Impact Report
| Vector | Assessment | Mitigation |
|---|---|---|
| **Data** | None — no schema, RPC, or storage changes | Zero SQL except one settings row insert for the flag |
| **Workflow** | None — queue writers untouched | Forbid edits to `safetyOfflineQueue.ts`, `safetyIncidentSubmit.ts`, `useSafetyOfflineSync.ts` core paths |
| **UI/UX** | New inspector sheet on incident-new + per-file retry chips on evidence list | Behind `ui_offline_inspector_v1` flag, default OFF |
| **Regression** | Low — additive components; existing `SafetyOfflineBadge` stays | Keep legacy badge as fallback for one cycle |
| **Cache** | None — inspector reads IndexedDB directly via existing helpers; no new react-query keys | — |
| **Scalability** | Queue is bounded (typically <50 items per user); O(n) render | Virtualize list if >100 items (cap render at 200) |
| **Rollback** | Flip `ui_offline_inspector_v1 = false` → instant revert | Verified before merge |

## 4. Step-by-Step Plan
| # | Step | Verification |
|---|---|---|
| 1 | Insert `ui_offline_inspector_v1` row in `safety_settings` (boolean, default `false`) | Row exists via read |
| 2 | Extend `safetyOfflineQueue.ts` with **read-only** `listQueue()` / `peekItem(id)` helpers (no mutation) | Unit tests cover empty, single, many; assert no new write paths |
| 3 | Create `src/components/safety/OfflineQueueInspector.tsx` — Sheet/Drawer listing queued incidents: client_submission_id, queued_at, retry_count, last_error, attached file count. Read-only. | Snapshot + a11y test |
| 4 | Create `src/components/safety/EvidenceRetryChip.tsx` — per-file chip showing upload status (`pending`/`uploading`/`failed`/`done`) with "Retry" button that re-invokes existing `useSafetyOfflineSync.retryItem(id)` (NOT a new path) | Unit test asserts only existing sync helper is called |
| 5 | Wire flag gate in `SafetyIncidentNew.tsx` and `SafetyIncidentDetail.tsx` evidence section: flag ON → render inspector trigger + retry chips; flag OFF → existing `SafetyOfflineBadge` only | Toggle test (flag on/off) |
| 6 | Add settings row in `SafetySettings.tsx` under "Experimental UI" (admin / safety_head only) | Existing settings RPC handles write |
| 7 | Update `DOCUMENTATION.md` + `POLICY.md` + bump version | grep confirms |
| 8 | Add memory `mem://features/safety/offline-inspector-v1` (files, flag, rollback). Update `mem://index.md`. | Index updated |
| 9 | Update `docs/safety-roadmap-phase2-7.md` + `docs/safety/phase0/idempotency-and-offline.md` to mark items (a)(b) **Shipped (flagged)** | grep confirms |

## 5. UI Changes
**Scope:** `/safety/incidents/new` and `/safety/incidents/:id` only. No route additions.

| Element | Current | After (flag ON) | Responsiveness |
|---|---|---|---|
| Offline badge | Count chip (e.g. "3 queued") | Same chip, now clickable → opens inspector Sheet | Sheet is full-screen `<md`, side drawer `≥md` |
| Inspector sheet | — | List of queued items with metadata + "Retry all" button (calls existing sync helper) | Vertical list, sticky header |
| Evidence list (detail page) | Filename + size | Filename + size + status chip + per-file "Retry" when failed | Chip wraps below filename `<md` |
| Action panel | Unchanged | Unchanged | Unchanged |

**Interaction impact:** Flag OFF → pixel-identical to today. No new required actions.

## 6. Implementation (Technical Notes)
- **Files added:** 3 (`OfflineQueueInspector.tsx`, `EvidenceRetryChip.tsx`, `src/test/safety/offlineInspector.test.tsx`).
- **Files edited:** 4 (`safetyOfflineQueue.ts` — additive read helpers only; `SafetyOfflineBadge.tsx` — wrap in trigger; `SafetyIncidentNew.tsx` + `SafetyIncidentDetail.tsx` — flag gate).
- **Migration:** None. Flag stored as a key/value row in `safety_settings` (consistent with `ui_incident_v2` runtime shape — does not touch dead Phase 3 columns).
- **Backup:** Automatic — no new tables.
- **Forbidden in this phase:** any edit to `safetyOfflineQueue.ts` mutation paths, `safetyIncidentSubmit.ts`, `useSafetyOfflineSync.ts` sync engine, `client_submission_id` generation, storage bucket, RLS, or SQL beyond the settings row.

## 7. Tests
- `offlineQueueReadHelpers.test.ts` — `listQueue()` returns correct order; `peekItem` returns null for missing id; no writes.
- `offlineInspector.test.tsx` — renders empty state, renders N items, "Retry" click invokes the mocked `useSafetyOfflineSync.retryItem` (assert exact spy).
- `noNewWriters.test.ts` — regex guard: new Phase 4 files contain zero `from('safety_incident_evidence').insert`, `from('safety-media').upload`, or `client_submission_id` assignments. Mirrors Phase 3 guard pattern.
- Existing Phase 1–3 Safety suite must remain green.

## 8. DOCUMENTATION.md Updates
- New §"Safety Phase 4 — Offline & Evidence UX" describing flag, components, rollback.
- Version history bump: `v2.66.13.21 — Safety offline inspector + evidence retry UX (flagged)`.

## 9. POLICY.md Updates
- New §"Safety Governance Phase 4" entry: UI-only, flag-gated, queue/idempotency/upload contracts preserved, rollback = flip flag.
- Cross-reference §Phase 4 checklist completion in governance doc.

## 10. Post-Implementation Notes
- Default `ui_offline_inspector_v1 = false` in production until safety-head sign-off.
- Phase 5 (Emergency overlay) remains blocked behind its own approval gate.
- Legacy `SafetyOfflineBadge` non-clickable mode retained for one cycle; removal scheduled for Phase 8.

---

**Approval needed from:** Principal Architect + Platform Lead (per governance §Phase 4 gate). On approval I'll insert the flag row first, wait for green-light, then ship the UI in a single follow-up commit.

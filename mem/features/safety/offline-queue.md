---
name: Safety Offline Incident Queue
description: Phase 1.E — IndexedDB-backed offline queue for safety incident submissions with idempotent server retries
type: feature
---
**Storage**
- Native IndexedDB (no `idb`/`dexie` dep). DB `safety_offline_v1`, store `pending_incidents`, schema v1.
- Each entry keyed by UUID = `client_submission_id`. Stores form payload + File blobs (IDB supports Blob natively) + attempts/last_error/last_attempt_at.

**Server idempotency**
- Server-side dedup via DB UNIQUE(reporter_id, client_submission_id). The lib `safetyIncidentSubmit.ts` first looks up the row by `client_submission_id` before inserting, so retries never duplicate incidents.
- Evidence dedup via `(file_name, size_bytes)` per incident — re-flushing skips already-stored files.

**Flow**
- `submitSafetyIncident({reporterId,payload,files})` is the SINGLE canonical write path; used by both online happy-path and offline flush. Always requires `client_submission_id`.
- `SafetyIncidentNew` generates the uuid, calls `submitSafetyIncident`, on `Failed to fetch`/`NetworkError`/`navigator.onLine===false` falls back to `enqueuePendingIncident`.
- `useSafetyOfflineSync` watches `online`/`offline` events, polls count every 15s, flushes sequentially on reconnect/mount, invalidates `['safety']`. Auto-prunes entries with attempts≥10 AND age>7d.
- `SafetyOfflineBadge` in `SafetyHeader`: hidden when online+empty; "Offline · N queued" red chip when offline; "N pending" button (manual flush) when online with backlog.

**Invariants**
- NEVER call `supabase.from('safety_incidents').insert(...)` directly from app code — always go through `submitSafetyIncident`. The `useReportSafetyIncident` hook (Phase 1.B) is now superseded for the form path; keep it only for non-offline call sites.
- NEVER auto-discard a queued entry on first failure — failures are recorded, only `pruneStalePending` (10 attempts AND 7d) drops them.
- Offline queue is per-device; multi-account on same device only flushes entries whose `reporter_id === user.id`.

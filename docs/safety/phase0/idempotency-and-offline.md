# Idempotency & Offline Queue

## Contract

- **Idempotency key column:** `safety_incidents.client_submission_id` (UUID,
  generated client-side). This is the **only** dedup key the server accepts.
- **Generator:** `src/lib/safetyIncidentSubmit.ts` mints a UUID v4 per
  submission attempt and persists it alongside the queued payload.
- **Server enforcement:** `safety_incident_before_insert` rejects duplicate
  `client_submission_id`. Replays therefore become no-ops.

## Offline queue

- Storage: native IndexedDB via `src/lib/safetyOfflineQueue.ts`.
- Producers: `SafetyIncidentNew` (and, by extension, evidence uploads).
- Sync engine: `useSafetyOfflineSync` — runs on `online` event and on app
  mount; respects backoff; never mutates the contract.
- Failure handling: failed items remain in queue with the original
  `client_submission_id`; retries are safe.

## Prototype-derived requests

| Request | Disposition |
|---|---|
| Rename to `idempotency_key` | **Reject** — would break server guard + history. |
| Replace IndexedDB with localStorage | **Reject** — capacity + atomicity regression. |
| Inspector sheet over queue (read-only) | **Accept** (Phase 4). |
| Per-file evidence retry UI | **Accept** (Phase 4). |

## Stop conditions

- Any code that writes incidents without a `client_submission_id`.
- Any second dedup column on `safety_incidents`.
- Any UI that bypasses `safetyOfflineQueue` for offline writes.
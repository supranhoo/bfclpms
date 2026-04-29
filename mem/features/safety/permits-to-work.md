---
name: Safety Permit-to-Work (PTW) module
description: Phase 2 PTW lifecycle — schema, RPC-only transitions, configurable approval ladders, HIRA/LOTO requirements, UI routes
type: feature
---

# Safety Permit-to-Work

## Lifecycle (DB enum `safety_permit_status`)
`draft → submitted → in_approval → approved → active → (suspended) → closed`.
Terminal: `closed`, `rejected`, `expired`.

## Hard rules
- **Status writes are RPC-only.** `BEFORE UPDATE` trigger blocks any direct
  status write unless `safety.permit_fsm = 'true'` is set in the RPC.
- **Permit numbering** is auto-generated `PTW-YYYY-NNNN` via sequence trigger.
- **Approval ladder** is materialised from `safety_permit_type_config` at
  `submit_permit()` time. Per-type configurable, no hardcoded levels.
- **HIRA required** for: hot_work, confined_space, work_at_height,
  electrical, excavation. **LOTO required** for: electrical,
  confined_space, lifting (or when `loto_required=true`).
- **No default duration** — user picks `start_at`/`end_at` every time. UI
  validates: window in future, end>start, ≥15min, ≤30days.
- `activate_permit()` includes a soft no-op for Phase 4 asset-expiry checks.
- `expire_overdue_permits()` runs every 15 min via cron (job
  `permit-expiry-sweep-15min`) + edge fn `permit-expiry-sweep`.

## RPCs (lifecycle)
`submit_permit(p_permit_id)` · `decide_permit_level(p_permit_id, p_decision, p_notes)`
· `activate_permit(p_permit_id)` · `suspend_permit(p_permit_id, p_reason)`
· `close_permit(p_permit_id, p_notes)` · `expire_overdue_permits()`.

## UI routes
- `/safety/permits` — list with status/type/text filters
- `/safety/permits/new` — single-page wizard (Save Draft / Submit for Approval)
- `/safety/permits/:id` — detail, approval ladder, HIRA/LOTO, action buttons
- `/safety/settings/permit-types` — admin per-type approval ladder editor

## Cache + realtime
All cache keys live under `['safety', 'permits', ...]`.
`useSafetyRealtimeSync` subscribes to `safety_permits` and
`safety_permit_approvals` and debounces 1.5s before invalidating.

## SSOT files
- `src/lib/safetyPermits.ts` — labels, validators, requirement helpers
- `src/hooks/useSafetyPermits.ts` — all queries + mutations (RPC wrappers)
- `src/components/safety/PermitStatusBadge.tsx` — semantic-token badge

## Tests
- `src/test/safetyPermits.test.ts` — 16 pure-logic tests locking the
  status/type enums, predicate sets (editable/terminal/live), HIRA/LOTO
  helpers, and `validatePermitWindow` boundary cases.
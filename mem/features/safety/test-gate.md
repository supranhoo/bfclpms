---
name: Safety Test Gate (Phase 1.H)
description: Pure-logic test suite locking the Safety FSM, SLA classifier, shell isolation, and offline queue
type: feature
---

## Suites
- `src/test/safetyShellIsolation.test.tsx` — asserts SafetyLayout/Sidebar/Header NEVER import PMS chrome (`AppSidebar`, `DashboardLayout`, `MinimalHeader`) and PMS DashboardLayout NEVER imports `safety/*`. Also smoke-renders `SafetyHome` inside a `QueryClientProvider`.
- `src/test/safetyFsmAndSla.test.ts` — locks the SSOT in `src/lib/safetyIncidents.ts`:
  - `SAFETY_INCIDENT_STAGES` order (7 stages).
  - `nextStage()` returns null at `closed` / `orphaned`.
  - `validateFsmTransition()` blocks skipping, reversing, self-transitions, and editing `closed`. `orphaned` revival is server-only.
  - `classifySlaState()` mirrors the `safety_incidents_with_sla` view: closed-status wins, then close-deadline (`red`), then ack-deadline (`amber`), else `green`.
- `src/test/safetyOfflineQueue.test.ts` — graceful degradation when IndexedDB is missing.

## Invariants
- `classifySlaState()` is a CLIENT-SIDE MIRROR of the DB view — UI must continue to read `sla_state` from the server. Never use the helper to override server values; it exists for tests and offline previews only.
- `validateFsmTransition()` is a pre-flight check; the authoritative gate is `transition_safety_incident()` RPC + the BEFORE UPDATE trigger. Never bypass the RPC even if the helper says "ok".
- Shell-isolation render must wrap pages in `QueryClientProvider` because dashboard hooks use TanStack Query.

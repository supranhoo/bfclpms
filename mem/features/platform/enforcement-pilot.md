---
name: Hub Platform Enforcement Pilot (Phase 3)
description: 4-gate UI enforcement for a single allowlisted action (pms.data.export); pilot flag + allowlist + rollback path
type: feature
---
# Hub Platform — Phase 3 Enforcement Pilot

## The 4 gates (ALL must be true to block)
1. `system_settings.hub_platform_settings_enabled = "true"` (master switch)
2. `system_settings.hub_enforcement_pilot_enabled = "true"` (pilot flag, default `"false"`)
3. `actionKey ∈ ENFORCEMENT_ALLOWLIST` — hard-coded `['pms.data.export']` in `src/lib/platformEnforcement.ts`
4. Resolved entitlement for the action is `false`

## Invariants
- Allowlist is a code constant — never grow without code review.
- UI-only. No backend / RLS / RPC enforcement in this phase.
- All other 12 wrapped actions remain observe-only (Phase 2B contract).
- Exactly one `entitlement_audit` row with `event_type='deny'` per blocked mount (via `deniedLoggedRef`).
- When blocked, observe-mode `would_deny` logging is suppressed for that mount to avoid duplicate rows.
- `BLOCK_MSG = "This action is disabled by Platform Owner settings."` — constant, locked by snapshot test.

## Rollback
- Instant: `UPDATE public.system_settings SET setting_value = '"false"'::jsonb WHERE setting_key = 'hub_enforcement_pilot_enabled';`
- Or flip Master switch OFF.
- Or via UI: Platform Settings → Overview → "Enforcement pilot" Switch → Disable.

## Code surface
- `src/lib/platformEnforcement.ts` — pure helpers (`ENFORCEMENT_ALLOWLIST`, `isEnforceable`, `shouldBlock`, `BLOCK_MSG`).
- `src/hooks/useEntitlement.ts` — `useEnforcementPilot()` (React Query, 10-min staleTime, key `['hub-enforcement-pilot']`), `logDeny()` mirror of `logWouldDeny`.
- `src/components/platform/CanAction.tsx` — enforcement branch + disabled overlay.
- `src/pages/platform/PlatformSettings.tsx` — "Enforcement pilot" card in Overview tab; `'deny'` added to `AUDIT_EVENT_TYPES`.
- `src/test/platformEnforcement.test.ts` — 11 unit tests locking the truth table + allowlist + BLOCK_MSG.

## Schema
Single additive migration: `entitlement_audit_event_type_check` extended with `'deny'`, and `system_settings` row `hub_enforcement_pilot_enabled` seeded `'"false"'::jsonb` on conflict do nothing.
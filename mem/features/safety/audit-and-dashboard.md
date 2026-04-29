---
name: Safety Audit Log & Home Dashboard
description: Phase 1.F deliverables — read-only Safety audit surface and live HSE KPI dashboard tiles
type: feature
---

## Audit log surface
- Page: `src/pages/safety/SafetyAuditLog.tsx` mounted at `/safety/settings/audit`.
- Hook: `useSafetyAuditLog({ entityType, eventType, search, limit })` reads from `safety_audit_log` and batch-fetches `profiles.full_name` for performer attribution (no FK declared on the table — never rely on PostgREST joins here).
- RLS already restricts SELECT to `has_safety_role(auth.uid(), 'admin')`. The page does NOT add any client-side gate beyond that — unauthorized users get an empty list instead of a route flash.
- Search is client-side across `event_type | entity_type | performer_name | details JSON`. Server filters apply for entity/event type via `.eq()`.
- Sidebar entry: "Audit Log" in `SafetySidebar.tsx`.

## SafetyHome dashboard
- Hook: `useSafetyDashboardStats()` aggregates the SLA-aware view `safety_incidents_with_sla` (cap 500 rows) into:
  - `open` (status ≠ closed), `bySla` counters, `byStatus` (zero-filled across `SAFETY_INCIDENT_STAGES`), `bySeverity`, `recent` (5), `overdue` (sla_state=red & open, max 8).
- UI tiles use semantic tokens; SLA tones map: red→destructive, amber→amber-500/10, success→emerald-500/10, primary for default.
- Always uses `SafetyStatusBadge` (not `StatusBadge`) and `SlaBadge` from `src/components/safety/`.

## Cache discipline
All keys live under `['safety', ...]`. Never call a global `invalidateQueries()` from these hooks.

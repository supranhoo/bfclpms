---
name: Safety Realtime Sync
description: Phase 1.G — module-scoped realtime invalidation hook mounted by SafetyLayout
type: feature
---

## Hook
`src/hooks/useSafetyRealtimeSync.ts` — single Supabase channel `safety-realtime-sync-<uid>` mounted once by `SafetyLayout`.

## Tables subscribed
- `safety_incidents` → invalidates `[safety,incidents]`, `[safety,incident]`, `[safety,dashboard-stats]`, `[safety,audit-log]`
- `safety_incident_status_history` → timeline + dashboard
- `safety_incident_evidence` → detail
- `safety_incident_progress_log` → detail
- `safety_notifications` (filtered `recipient_id=eq.<uid>`) → bell
- `safety_sla_escalations` → SLA monitor + dashboard

## Invariants
- Debounced 1500ms (matches PMS `useRealtimeKpiSync`) to coalesce bursts.
- ALL invalidations are under `['safety', ...]` — never touches PMS caches (POLICY §110).
- Mounted ONLY by `SafetyLayout`; never duplicate inside child pages.
- `useSafetyOfflineSync` is mounted by `SafetyOfflineBadge` (in header) — do NOT mount it again at layout level or intervals/listeners double up.
- The notifications channel in `useSafetyNotifications` remains the source of truth for the bell's own list query; this hook complements it by invalidating broader safety keys.

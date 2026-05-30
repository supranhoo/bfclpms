---
name: Safety SLA Monitor v2 (Phase 11)
description: Flag-gated at-risk incident queue card and SLA countdown badge on top of Phase 1.D escalation engine
type: feature
---
# Safety SLA Monitor v2 — Phase 11

## Flag
- `safety_settings.ui_safety_sla_v2` (boolean, default `false`). Phase 1.D layout preserved verbatim when OFF.

## What ships
- `src/lib/safetySla.ts` — SSOT pure helpers (`classifySla`, `formatSlaCountdown`, `prioritizeSlaQueue`, `badgeToneFor`). TS mirrors the `safety_incidents_with_sla` view: closed → closed; `now > close_due_at` → red; inside last 25% of `[created_at, close_due_at]` → amber; else green.
- `SafetySlaBadge` — read-only countdown chip (`Overdue Xd Yh` / `Xh Ym left` / `Closed`).
- `SafetySlaQueueCard` — derives queue from cached `useSafetyIncidents()`, sorts red → amber, caps 100 on screen. No new fetch, no realtime, no writers.
- Mounted in `SafetySlaMonitor` above the existing history table when flag ON.

## Invariants
- Additive only. No Phase 1.D tile/table/button is removed or restyled.
- ZERO writers in v2 paths (`.insert / .update / .upsert / .delete / .rpc / .upload / fetch(`) — guarded by `src/test/safety/slaV2NoNewWriters.test.ts`.
- Engine ownership unchanged: `public.run_safety_sla_escalations()` (SECURITY DEFINER) runs every 5 min via pg_cron.
- Any change to the `safety_incidents_with_sla` view rule MUST be paired with a `classifySla` + test update.
- Rollback = flip flag back to `false`. No schema/data migration needed.
EOF
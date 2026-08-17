---
name: Days in Stage — audit-trail SSOT
description: Ageing/day-count columns must derive from kpi_audit_logs via daysInStage.ts, never kpis.updated_at
type: feature
---
ADR-292 / POLICY §RPT-DAYS-IN-STAGE-AUDIT-SSOT.

- Never compute "days pending / days in stage" from `kpis.updated_at` — any bulk write resets it (a 15-Aug-2026 system write made every July KPI read "1d").
- Use `src/lib/review/daysInStage.ts`: `isStageMovingAction` → `buildStageEntryMap` → `resolveDaysInStage`.
- Score/value, ORG_KPI_*, query and weightage audit rows must NOT reset the clock; send-backs and step-backs MUST.
- Fallback chain: latest stage event → first audit event → `created_at`. Never a silent `0`.
- Terminal (`approved`) → `null` → `—` on screen, blank in Excel. Screen and export read the same value.
- Wired: `src/pages/reports/KpiStatusTracker.tsx` (`days_in_stage`). Bottleneck Report still uses `bottleneckResolver`.

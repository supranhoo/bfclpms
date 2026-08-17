---
name: Pending At Level — workflow-chain SSOT
description: pending_at_level must come from the resolved stage chain (next stage), never a status->label map
type: feature
---
ADR-293 / POLICY §RPT-PENDING-AT-LEVEL-CHAIN-SSOT.

- `kpis.status` = last COMPLETED stage, so the pending level is the NEXT stage in the employee's resolved chain (`get_bulk_employee_workflows`, POLICY §105).
- Use `src/lib/reports/pendingAtLevel.ts` → `resolvePendingAtLevel({ status, isOrgKpi, stageChain })`. Never a hardcoded status→label ladder.
- `kra_set` → "Org KPI Data Owner" (org KPI) / "Employee (Self Review)" (individual). `approved` or no next stage → `—`.
- Must share the same `stageChainMap` as `pendingWithResolver` so "Pending At Level" and "Pending With (Name)" always agree.
- Wired: `src/pages/reports/KpiStatusTracker.tsx` (`pending_at_level`), screen + Excel.

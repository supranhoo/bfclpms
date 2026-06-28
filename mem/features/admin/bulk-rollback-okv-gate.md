---
name: Bulk Rollback OKV-truth gate
description: "Rollback All Scopes" button visibility on Org KPI cards must use OKV per-scope status, not fact-based card status
type: feature
---

ADR-091 (2026-06-28). The Org KPI Data Entry card uses ADR-055 fact-based inference: `data.status === 'propagated'` can be true purely because every mapped child `kpis` row advanced past `kra_set` — with zero `org_kpi_values` rows in propagated/approved state.

`useBulkRollbackOrgKpiPropagation` can only act on OKV rows where `status IN ('propagated','approved')`. Gating the **Rollback All Scopes** button on card status therefore produces a guaranteed-fail UX (e.g. "Handle all breakdowns…" May 2026 — card shows 7 scopes Propagated, OKV has 1 pending row, click → "No propagated scopes" toast).

**Rule:** Bulk Rollback button visibility = `hasBulkRollbackTarget(data.scopedRows)` from `src/lib/orgKpiStatus.ts`. Pure helper, unit-tested in `src/test/bulkRollbackOrgKpiPropagation.test.ts`. Single-scope Rollback and Repair Gap actions are unchanged. Never extend the bulk hook to clear child KPIs at `manager_check`/`approved` — that would destroy reviewer scores (POLICY §88 immutability).

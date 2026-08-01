---
name: Org KPI child-truth bulk rollback
description: Bulk rollback of Org KPI propagation must be driven by child kpis rows, not org_kpi_values status (ADR-227)
type: feature
---
ADR-227 (2026-08-01), POLICY §ORG-KPI-ROLLBACK-CHILD-TRUTH.

- Bulk rollback runs entirely inside `rollback_org_kpi_propagation_by_children(kra, kpi, period, year, reason)` — SECURITY DEFINER, admin or data-owner, reason >= 3 chars.
- Work list = `kpis` where `is_org_level = true` + KRA/KPI/period/year. NEVER gate the work list on `org_kpi_values.status` — master rows can already be `draft` while children still carry the wrong value (July 2026 Training-Hours incident).
- Admin-forced: cells at `manager_check` and later are reset to `kra_set` and their reviewer scores cleared. `approved` / `management_review` are never touched and are returned as `skipped_approved` (POLICY §88 immutability).
- Returns `{scopes_reset, scorecards_cleared, manager_stage_cleared, skipped_approved, total_children}`; audit row action = `bulk_rollback_children`.
- `hasBulkRollbackTarget` (src/lib/orgKpiStatus.ts) stays aligned because scoped row status already folds in `isPastKraSet`.
- Drift diagnostic: `org_kpi_master_child_drift(period, year)` + `useOrgKpiMasterChildDrift`, admin-only banner on /admin/org-kpi-data.

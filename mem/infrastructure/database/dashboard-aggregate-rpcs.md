---
name: Dashboard Aggregate RPCs
description: Admin and Management dashboard read paths must go through SECURITY DEFINER aggregate RPCs, not raw PostgREST scans
type: feature
---
- `get_admin_dashboard_stats()` returns one jsonb row consumed by `AdminDashboard` — do not reintroduce the 5-query parallel block or `kpis.select('status')` full scan.
- `get_management_dashboard_rows(p_year, p_months, p_employee_ids)` is the only fetch path for `ManagementDashboard`'s fiscal grid; client keeps `getKpiDueDate` (TS) as the overdue source of truth.
- Dashboard `useQuery` calls must set `staleTime` (≥ 60 s) and `gcTime` (≥ 5 min); roster/filter hooks ≥ 2 min staleTime. Mutations already invalidate.
- ADR-083 captures the rationale and rollback path.
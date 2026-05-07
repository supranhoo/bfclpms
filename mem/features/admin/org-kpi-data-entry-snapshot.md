---
name: Org KPI Data Entry Snapshot RPC
description: Org KPI Data Entry must read via get_org_kpi_data_entry_snapshot RPC, never raw kpis paged fetch
type: feature
---
The `/admin/org-kpi-data` page reads its KPI definitions, employee/department mapping arrays, per-employee targets, and kra_set tracking through the `public.get_org_kpi_data_entry_snapshot(p_period, p_year)` RPC.

Why: The previous client-side path paged 800+ raw `kpis` rows through heavy RLS and intermittently hit `statement_timeout` (57014), which the UI rendered as "No org-level KPIs exist."

Rules:
- Do NOT reintroduce `supabase.from('kpis').select(...)` paged fetches in `useOrgLevelKpisWithEmployees`.
- The snapshot RPC is `SECURITY DEFINER` and enforces access in-function: admin / auditor / management / hr_pms see all; data owners see only assigned definitions; everyone else gets an empty snapshot.
- The RPC excludes inactive employees from `employeeCount`, `employeeIds`, `departmentIds`, and `mappedEmpIdsByKey`.
- The Retry button on `query-error` must invalidate `org-level-kpis-with-employees`, `org-level-kpis`, `org-kpi-values`, and `org-kpi-data-owners` query keys.
- ADR-061 — The scoped entry table (Per-Employee / Per-Department) renders from `mappedEmployeesMap` / `mappedDepartmentsMap` + `perEmployeeTargetMap` returned by the snapshot. `useProfiles` and `useDepartments` are display enrichments only and MUST NOT gate the editor; doing so hides the input box whenever those paged queries lag or RLS hides a mapped profile (regression seen May 2026 on Cost Management & Optimization → Adherence to Electrical Maintenance Budget).

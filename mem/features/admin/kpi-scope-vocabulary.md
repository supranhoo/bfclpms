---
name: kpi-scope-vocabulary
description: One KPI scope vocabulary (Individual/Organization/Department/Employee) — SSOT in kpiScope.ts, two columns only (ADR-319)
type: feature
---
A KPI has one scope. `src/lib/review/kpiScope.ts` is the SSOT for the scope list, labels, hints and the column mapping; every surface offering a scope imports it (console create dialog, Org KPI scope menu). Never re-declare scope words in a component.

- Live scopes: `individual | organization | department | employee`. Planned (disabled everywhere): division, business_unit, location, pms_grade, level.
- Storage: `is_org_level` + `org_level_scope` only. Individual ⇒ `is_org_level=false`, `org_level_scope=NULL`.
- `kpi_group_type` is deprecated — never write or read it.
- Legacy console words `shared` → organization, `department_event` → department are read-only aliases; `bu_console_kpi_create` accepts `scope` with `kind` fallback.

POLICY §KPI-SCOPE-SINGLE-VOCABULARY · ADR-319 · tests `src/lib/review/kpiScope.test.ts`.

---
name: Performance Console Review Run
description: KPI x employee worksheet, employee scorecard drawer and tiered target rules for running reviews from the console (ADR-286, ADR-288)
type: feature
---
Review Run tab = the console way to process a shared KPI across many people.
- Grid: KPIs as rows, employees as columns (virtualized). Never auto-loads; scope/stage change resets to "Load worksheet". Server refuses > 25,000 cells (`capped`).
- RPCs only: `bu_console_run_snapshot`, `bu_console_kpi_advance` (dry-run then commit, one audited batch), `bu_console_employee_scorecard`, `bu_console_target_rules_apply`. No client writes to `kpis`/`review_submissions`.
- Rows with `final_score IS NOT NULL` are never selectable (POLICY §88). Tier gating from ADR-284/285 still applies (`kra_set_admin_only`).
- `EmployeeScorecardDrawer` = person-first close-out for one employee's whole period.
- Tiered targets (`bu_console_target_rules`): dimensions `default|level|designation|department|is_manager`, first match by `priority`, `default` always last; hand-tuned targets win unless "replace tuned targets". Targets only — scoring model stays group-owned (ADR-282).
- Client mirrors + tests: `reviewRunModel.ts(.test)`, `targetRuleModel.ts(.test)`.

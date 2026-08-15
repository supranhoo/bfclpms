---
name: BU Console Goal Objects
description: Category/KRA-anchored goals with one level of sub-goals, weighted roll-up from live kpis rows, admin-only writes (ADR-263, ADR-267)
type: feature
---
`public.bu_goals` = a named target anchored to a KRA **category** (optional `kra_name`, optional `kpi_name_match`), scoped by BU/dept/period/year, with sub-goals **one level deep** (`parent_goal_id`).
- `kpi_definitions_master` is empty — never link goals to it. Linkage is to live `kpis` rows by category + KRA name + KPI name (ADR-267). `definition_id` is legacy/nullable.
- `goal_source`: `kpi_rollup` (weighted aggregation of matching employee KPI rows) | `child_rollup` (sub-goals weighted by `weight`) | `manual` (only source that accepts a typed `current_value`).
- A goal states intent only; it never grades. Employee scoring stays the per-employee 0-5 bands and the resolved workflow. Roll-up never writes to `kpis`/`review_submissions`.
- Roll-up is weightage-weighted per period (never a straight average), excludes N/A and unscored rows, then summarises periods by the stored `subperiod_summary_rule` (last|sum|avg), and returns the per-period breakdown.
- RPCs: `bu_goal_list` (nested, paged 200 top-level), `bu_goal_upsert`, `bu_goal_rollup`, `bu_goal_archive`, `bu_goal_kra_options` (live KRA/KPI pickers, reports totals when truncated). Read = `bu_console_can_read`; write/archive = admin only.
- Progress = (current - start) / (target - start), clamped 0-100; unknowable progress renders "not measurable yet", never 0%.

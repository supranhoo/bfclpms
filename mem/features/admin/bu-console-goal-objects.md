---
name: BU Console Goal Objects
description: bu_goals per-scope goal rows, weighted roll-up, stored sub-period summary rule, admin-only writes (ADR-263)
type: feature
---
`public.bu_goals` = one goal per `kpi_definitions_master` definition per scope (entity_level org|bu|department|individual, BU, dept, review_period NULL = full year, review_year).
- A goal states intent only. It never grades: employee scoring stays the per-employee 0-5 bands.
- `current_value` is writable only when `tracking_method = 'manual'`; otherwise it comes from `bu_goal_rollup`.
- Roll-up is weightage-weighted per period (never a straight average), excludes N/A and unscored rows, then summarises periods by the goal's stored `subperiod_summary_rule` (last|sum|avg). It returns the per-period breakdown so the headline number is explainable, and never writes to `kpis`/`review_submissions`.
- RPCs: `bu_goal_list` (paged 200), `bu_goal_upsert`, `bu_goal_rollup`, `bu_goal_archive`. Read = `bu_console_can_read`; create/edit/archive/persist = admin only.
- Progress is measured start→target, clamped 0-100; unknowable progress renders "not measurable yet", never 0%.
- No goal-level approval chain — approval stays the resolved per-employee workflow.

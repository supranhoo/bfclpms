# BU Performance Console (Beta) — Group-Driven PMS

Admin-only beta at `/admin/bu-console`. Shifts review from "one employee at a time" to "one KPI value, many employees", navigated by Business Unit. Nothing existing is removed or rewired — the beta is an additional surface over the current engine.

## Why

Grounded numbers from the live database today:
- 20,696 KPI rows across 1,396 distinct KPI names and 455 distinct KRA names, in 81 categories, 44 business units.
- 262 org-KPI data-owner mappings already exist — the "one value, many employees" primitive is already in the system, it just has no BU-level cockpit on top of it.
- 2,584 active employees; ~150 currently in the PMS review loop, heading to ~700.

Reviewing the same KPI employee-by-employee is the bottleneck. One value entered once, fanned out with per-employee weightage and per-employee 0-5 scoring, removes the repetition.

## What gets built

### 1. BU Console dashboard (drilldown)

```text
[ Business Unit ▾ (multi, all by default) ] [ Department ▾ (optional) ] [ Period ▾ ]

┌ Production ┐┌ Costing ┐┌ Maintenance ┐┌ Environment ┐┌ Safety ┐┌ Quality ┐   <- category folders
└────────────┘└─────────┘└─────────────┘└────────────┘└───────┘└────────┘
   ▼ click a category
   KRA list (name, #KPIs, #employees, entry status, review status)
      ▼ click a KRA
      KPI list (target, actual, value status, #employees mapped)
         ▼ click a KPI
         Detail drawer: definition, formula, scoring scale,
                        one Actual value box, mapped-employee table
            ▼ click an employee
            Their weightage, their derived 0-5 rating,
            deep links into the existing scorecard / self-review screens
```

Filters follow the existing multi-select cascading filter standard. Page mounts empty and hydrates on explicit load — no wide scans on mount.

### 2. One-value entry, many employees

The data owner enters the actual value once on the KPI detail drawer. The system fans it out to every mapped employee in scope: same value for all, but each employee keeps their own weightage and their own scoring scale, so ratings legitimately differ. A preview dialog shows exactly which employees will be written, which will be skipped and why, before anything is saved.

### 3. Group approval through the existing workflow

Per your answer, the beta does **not** invent a new chain. Each employee's approval path is resolved from the existing workflow configuration, exactly as it is today. The console simply lets a reviewer act on a whole group of employees for one KPI in a single action, and the engine applies each employee's own next stage. Employees whose stage does not permit the action are skipped and listed with the reason. Scores already finalised are never overwritten.

### 4. KPI decomposition library + de-duplication proposals

Three new master tables, and existing KPI rows are **linked** to them, not rewritten:
- **Definition** — the KPI name, description, unit, frequency.
- **Formula** — how the actual is computed.
- **Scoring scale** — the 0-5 band logic.

Because these are separate, the same "Production Target vs Actual" definition can be reused across BUs with a different scale, and the KRA stops looking duplicated just because a scale differed.

A de-duplication queue proposes merges for near-identical entries (spelling, comma, extra space, casing) using the existing KPI standardization normalisation. **Every merge is a proposal an admin approves** — nothing merges automatically, and merging only re-points links, never edits historical scores.

### 5. Goal object, borrowed from the Peoplebox model

Peoplebox (peoplebox.ai) solves the same "one goal, many people" problem with a single generic **goal** object rather than separate company/team/individual features. We adopt the parts that fit our engine and skip the parts that clash with it.

What we take:
- **One object, an entity level on it.** A goal is created at Org / BU / Department / Individual level. Same table, same fields — the level just says who it belongs to. In our case the BU-level goal is exactly today's org KPI, so no new concept is introduced for the user.
- **Parent link instead of a rigid tree.** Every goal can point at a parent goal. A BU "Production Target vs Actual" is the parent; the employee rows mapped to it are its children. This is what makes the console's drilldown a real hierarchy rather than a filtered list, and it gives us the alignment view for free.
- **Goal = a metric.** `start value`, `target value`, `current value`, `unit`, plus a progress type (number / currency / percentage / rollup-only). This is the same shape as our KPI definition + formula split, so the library tables carry these fields rather than a parallel structure.
- **Explicit tracking method** on each goal: manual entry, roll-up from children, or fed from a data source. Today everything is manual; naming the field now means the org-KPI auto-feed later is a value change, not a migration.
- **Milestones for sub-periods.** Monthly slices under an annual goal, each with its own target, and a stated rule for how the parent summarises them (latest value vs sum vs average). Our multi-month and daily/weekly KPIs already behave this way — making the summarise rule an explicit field kills a long tail of "why is the annual number not the sum" questions.
- **Cycles as a first-class object.** Goals attach to a named cycle with start/due dates. We already have fiscal periods and annual cycles; the console reads them, it does not create a second calendar.
- **Visibility on the goal** — public / restricted / custom. Peoplebox's own lesson is that a goal a manager cannot see silently drops out of the review; our version resolves visibility through the existing access-profile and org-scope rules and **shows skipped goals with the reason** instead of hiding them.
- **Owners are named on the goal.** One data-entry owner, optional additional owners. Matches the existing `org_kpi_data_owners` mapping.

What we deliberately do not take:
- **No 0–1.0 OKR grading.** Our scoring is the existing 0–5 scale with per-employee scoring bands. Goal progress feeds that; it does not replace it.
- **No straight-average roll-up.** Peoplebox averages children into the parent. We keep our weighted calculation — each employee's weightage is the whole point.
- **No goal-time approval chain of its own.** Approval stays the resolved per-employee workflow; the goal object carries no second approval path.
- **No chat-tool check-ins in the beta.** Entry happens in the console; reminders continue through the existing notification engine.

Net effect on the plan: the library tables from section 4 gain the metric fields (start/target/current/unit/progress type), a `parent_goal_id`, a tracking method, a summarise rule for sub-periods, and a cycle reference. Nothing else in the plan changes shape.

## Explicitly out of scope for the beta

- No change to any existing review screen's behaviour.
- No change to how final scores are calculated, locked or reported.
- No automatic KPI merges, no automatic re-scoring of past periods.
- Non-admin roles cannot reach the console (feature-flagged, admin-only).

## Rollout

1. Library tables + linking + de-dup proposal queue (read-only impact).
2. Console drilldown, read-only.
3. One-value entry with preview + skip reasons.
4. Group approval through resolved workflows.
5. Admin pilot on 1-2 BUs for one period, measured against the current per-employee time cost.

Each phase is independently shippable and independently reversible.

## Technical section

**Reuse, not rebuild.** The write path is the existing `propagate_org_kpi_value` family (with its `p_overwrite_policy` tiers and POLICY §111.6 skip taxonomy) plus the existing bulk stage-advance path; the read path extends `get_org_kpi_data_entry_snapshot`. This is the previously drafted ADR-064 / PRD-group-scoring contract, now with a BU-hierarchy cockpit in front of it.

New objects:
- `kpi_definitions_master`, `kpi_formulas`, `kpi_scoring_scales` (+ `kpi_definition_links` mapping `kpis` rows to the triple), `kpi_merge_proposals`. All in `public`, all with GRANTs to `authenticated`/`service_role`, RLS admin-write / role-scoped read, `created_at`/`updated_at` + update trigger.
- Goal fields (section 5) land on `kpi_definitions_master` plus a per-scope `bu_goals` row: `entity_level` (org|bu|department|individual), `parent_goal_id UUID NULL` (self-FK), `progress_type`, `start_value`, `target_value`, `current_value`, `unit`, `tracking_method` (manual|rollup|source), `subperiod_summary_rule` (last|sum|avg), `cycle_ref` (existing period/annual cycle), `visibility`. Additive only; `individual` level continues to read from `kpis`/`review_submissions` — no employee data is copied into the new tables.
- Roll-up is computed, never stored twice: parent `current_value` is derived from children by the declared `subperiod_summary_rule`, with our weighted logic (not an average) for employee-level aggregation.
- RPCs (all SECURITY DEFINER, role-checked, `search_path = public`): `bu_console_tree(p_bu_ids[], p_dept_ids[], p_period, p_year)` returning category→KRA→KPI counts only; `bu_console_kpi_detail(p_kpi_key, ...)` returning the mapped-employee slice paged; `bu_console_group_write(...)` delegating to `propagate_org_kpi_value`; `bu_console_group_advance(...)` delegating to the existing stage-advance guard.
- Join keys normalised through `normalizeKpiKey` / `public.normalize_kpi_text` on both sides, per ADR-054/057.

Guardrails: click-to-load, server-side pagination everywhere (page size 200), hard scope cap, `@tanstack/react-virtual` on long lists, no realtime on the page, staleTime ≥ 60s. Group writes skip rows with a non-null `final_score` (POLICY §88) — hard RPC guard plus unit test. Every write emits an audit row with a shared batch id; automated actions set `performed_by = NULL`. New tables are covered automatically by `get_backup_table_order()`.

Rollback: the console is feature-flagged off; library tables are additive and droppable; every group write is batch-tagged so it can be reverted wholesale via the existing rollback path.

Docs: new ADR-259 (console + group review) and ADR-260 (KPI decomposition library), POLICY sections for group write and merge governance, DOCUMENTATION.md and CHANGELOG updated in the same steps. Unit tests + mock data per phase: fan-out correctness, skip taxonomy, final-score immutability, merge proposal approval, cascading filter behaviour.

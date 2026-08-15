# Goals, rebuilt as Category → KRA → Goal → Sub-goal

## What you expected vs what exists

Your model: a goal lives **inside a category / KRA**. "Production" (category) holds the KRA-level goal "achieve the organisation's production target", and under it CPP owns three child goals — 45 MW AFBC, 45 MW WHRB, 8 MW — each rolling up into the parent.

What is built today: a flat Goals tab where each goal points at exactly **one KPI definition** picked from the KPI Library. It sits as a third tab because it was modelled as a library object, not as part of the console tree.

## Two verified problems

1. **The goals layer is not linked to your real data.** Goals can only point at rows in the master KPI library table, and that table is currently empty (0 rows), while live review data holds 17,594 KPI rows for 2026 across 81 categories, 440 KRAs and 1,327 KPI names. So the "pick a KPI definition" dropdown in the goal form has nothing to offer — the goal object cannot presently attach to anything real.
2. **No hierarchy is expressed in the UI.** The table has a `parent_goal_id` column but the form never sets it and the tab renders a flat list, so "one KRA goal with three plant sub-goals" is not expressible. There are currently 0 goals stored, so nothing is lost by reshaping this.

## Proposed shape

```text
Category: Production
└── Goal (KRA level): Achieve organisation production target      target 1,200,000 MT
    ├── Sub-goal: 45 MW AFBC        BU: CPP    target 300,000 MT   rollup
    ├── Sub-goal: 45 MW WHRB        BU: CPP    target 260,000 MT   rollup
    └── Sub-goal: 8 MW              BU: CPP    target  60,000 MT   manual
        └── linked KPIs → the employees already scored on them
```

- A goal gets a **name of its own** and is anchored to a **category (+ optional KRA)**, not forced onto a single KPI definition.
- A goal may optionally **link to live KPIs** by category + KRA + KPI name, matching the rows employees are actually scored on. That is the link to existing data.
- Parent goals do not need any KPI link — their value is the roll-up of their children, using each child's declared weight (never a plain average).
- The Goals tab moves **inside the console tree** as a lens on the same Category → KRA drill-down, so it stops sitting oddly between the console and the KPI library.

## How it links to existing data

Three linkage modes per goal, chosen when creating it:

- **Rolled up from employee KPIs** — the goal names a category + KRA (+ optional KPI name) and a scope (BU / department / period). It reads the existing scored `kpis` rows in that scope, weightage-weighted, excluding N/A and unscored, and summarises sub-periods by the goal's own rule (last / sum / avg). Review data is never written to.
- **Rolled up from child goals** — parent goal value = weighted sum/avg of children, so the CPP three-plant example produces the KRA number automatically.
- **Manual** — a number the BU types in, for targets that have no per-employee KPI behind them yet.

## Real use, stated plainly

Goals answer "what is the BU aiming at and are we on track", which the per-employee scorecard cannot answer: scorecards grade people 0–5, goals track output against a target in real units (MT, MW, %, ₹). If you do not want a target layer separate from employee scoring, the honest option is to drop the Goals tab entirely rather than keep a half-connected one — say the word and the plan becomes a removal instead.

## Technical changes

- **Schema (additive, table currently empty):** add `title`, `category_id`, `kra_name`, `kpi_name_match`, `weight`, `goal_source` (`kpi_rollup` | `child_rollup` | `manual`) to `public.bu_goals`; make `definition_id` nullable; keep `parent_goal_id`. Grants + RLS unchanged in shape (read = `bu_console_can_read`, write = admin).
- **RPCs:** `bu_goal_list` returns a parent/child tree for the scope; `bu_goal_upsert` accepts the new fields and validates one-level-deep parenting and a self/cycle guard; `bu_goal_rollup` gains the child-roll-up branch and keeps returning its per-period breakdown so every headline number is explainable. All server-paged, no silent truncation (§BU-CONSOLE-NO-SILENT-TRUNCATION).
- **KPI matching:** goals resolve live rows through the existing normalised KPI key (category + KRA + KPI name) used elsewhere, so alias/duplicate handling stays consistent with the KPI Library.
- **UI:** `GoalsTab` renders a nested tree with "Add sub-goal" per row and progress bars at both levels; `GoalFormDialog` replaces the definition picker with category → KRA → optional KPI selectors plus a source selector; goals also surface as a badge on the matching node in `BuConsoleTree`.
- **Tests:** extend `goalObjects.test.ts` with parent roll-up from children (weighted, not averaged), cycle-guard rejection, and "not measurable yet" when children have no data.
- **Docs:** ADR-267 supersedes the goal-shape section of ADR-263; POLICY §BU-CONSOLE-GOALS updated; DOCUMENTATION.md version history entry.

## Risk

- Data: additive columns on an empty table; no review data is read-modified — roll-up is read-only against `kpis`.
- Regression: goals are feature-flagged behind `feature_bu_console` and touch no scoring, workflow or report path.
- Rollback: drop the added columns and restore the previous three RPC bodies.

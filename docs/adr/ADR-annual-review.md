# ADR — Annual Review Module

- Status: Accepted
- Date: 2026-06-14

## Context
Annual reviews differ structurally from periodic KPI reviews: a single
long-running cycle, a fixed multi-stage reviewer chain (self → manager →
skip → BU → HR), versioned templates with criteria weights, system-score
inputs, HR-managed final rating, and employee acknowledgment with optional
rebuttal.

## Decisions
1. **Separate `annual_review_*` tables.** Keeps the schema isolated from
   `review_submissions` / `org_kpi_values`. Lets eligibility, templates, and
   acknowledgments evolve without risking operational PMS.
2. **Single instance per employee × cycle.** Reviewer chain is snapshotted at
   seed time. Mid-cycle changes go through an explicit
   `annual_review_assignment_overrides` row for a clean audit story.
3. **Edge-function reminders, not DB cron.** Reminder cadence is product
   policy; keeping it in TypeScript next to the templates is cheaper to evolve.
4. **Template versioning via clone.** Mutating a published template would
   silently change historical results. `clone_annual_review_template` creates
   a new inactive version under the same `parent_template_id` lineage.
5. **Reopen is manual and audited.** No automated transitions out of
   `closed`. HR/admin must call `reopen_annual_review_cycle` with a reason.
6. **Server-side pagination from day one.** Admin progress and the report
   page query at most `pageSize` rows (≤ 100). Summary cards consume a
   one-column aggregate to avoid loading the full org list.

## Consequences
- Two surfaces (Admin Progress, Report page) share one pagination service.
- Override table is small but must be consulted by any reviewer-resolution
  code path. Centralise in `getEffectiveReviewer(instance, role)`.
- Acknowledgment writes after `closed` are allowed via explicit trigger
  carve-out — keep the exception list short.
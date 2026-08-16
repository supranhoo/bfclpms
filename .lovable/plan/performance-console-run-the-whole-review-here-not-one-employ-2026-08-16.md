# Performance Console: run the whole review here, not one employee at a time

## The gap today

The console can already do three things well, but each one is narrow:

- **One KPI at a time.** "Enter group value" and "Approve group" live inside a single KPI's detail modal. To process a category you open 6 KPIs in turn.
- **Pipeline is read-only navigation.** It counts what is pending per stage and deep-links to the old dashboard — the actual act still happens there, per employee.
- **Different targets per person already work, but only manually.** Per-employee tuning (`bu_console_kpi_overrides`) can give a manager target 10 and the team target 5, one row at a time. There is no way to say "managers get 10, everyone below gets 5" as a rule.

The scoring engine is already the right shape for this: a group value is fanned out and each employee is rated against **their own** target and their own R0–R5 ladder. So one organisational value can legitimately produce different scores per person. What is missing is the surface that lets a reviewer act on many KPIs and many people in one pass.

## Proposal — three additions

### 1. Review Run (new console tab): a KPI x employee worksheet

A single worksheet for the chosen scope (period, company, BU, dept, manager) and a chosen stage.

```text
 KPI (rows)                    | Kiran | Sajid | Anup | ... | Group value
 Power generation 45 MWh/AFBC  |  4.2  |  4.2  | 4.2  |     | [ 41.8 ] apply
 SOP creation                  |  5.0  |  3.0  | 4.0  |     |   n/a (individual)
 Safety observations closed    |   —   |   —   |  —   |     | [     ] apply
```

- Rows = KPIs in scope, columns = employees. Cells show the score at the viewer's stage; a cell can be edited to override one person.
- **Group value column**: type once, preview, apply to every mapped employee (reuses the existing fan-out, which already respects final-score immutability, reviewer locks and per-employee targets).
- **Select rows / columns and advance a stage** in one action (reuses the existing group advance), with the same preview-then-commit and skipped-reason list.
- Sticky "N cells pending" footer so the reviewer sees the run shrink as they work.
- Loads only on an explicit **Load** click, capped (reject scopes above ~25,000 cells), with row and column virtualisation — same guardrails as the existing bulk-review PRD.

### 2. Employee column drawer: approve a whole scorecard

Clicking an employee's column header opens their full KPI list for the period inside the console (all KRAs, scores, evidence, remarks) with one "Approve all at my stage" action plus per-KPI send-back. This is the "process everything for this person without leaving the console" path.

### 3. Target rules: one KPI, tiered targets by band

New admin object attached to a group KPI definition:

```text
SOP creation — targets
  Level = Manager and above ....... 10
  Level = Executive ................ 5
  Default .......................... 5
```

- Rules resolve on **level / designation / department / is-a-manager**, applied when the group definition is pushed or when a new employee is mapped.
- A rule write is a normal console edit run: dry-run preview showing exactly who moves from what to what, undoable, audited.
- Manual per-employee tuning still wins over a rule, and stays flagged as an override so a later rule push does not silently overwrite it.
- Scoring model (KPI type, options, R0–R5, direction) stays group-owned — rules set scope values only, never fork the scoring model.

## Order of work

1. **Review Run tab** — the biggest win, built entirely on RPCs that already exist plus one snapshot RPC for the grid.
2. **Employee column drawer** — reuses the same snapshot, adds a per-employee advance path.
3. **Target rules** — new table, resolver and preview UI; independent of 1 and 2.

## Who can do what

Unchanged from the current access tiers: admin can act at every stage; management and audit can act once a KPI has moved past KRA-set; HR-PMS and everyone else read only. Every bulk action is one audited batch with a reason list for skipped rows, and approved final scores are never touched.

## Technical notes

- New RPC `bu_console_run_snapshot(period, year, stage, scope filters, page, page_size)` — slim projection (kpi_id, employee_id, stage score, status, is_na, weightage), SECURITY DEFINER, role-checked, paged at 200 employees.
- Reuse `bu_console_group_write`, `bu_console_group_advance`, `bu_console_kpi_actionable`, `bu_console_can_write`, `bu_console_bulk_row_overrides`.
- New table `bu_console_target_rules` (kpi group key, scope, match dimension, match value, target, priority) with GRANTs, RLS and admin-only writes; resolver function `bu_console_resolve_target(kpi_id)`; picked up automatically by the backup order RPC.
- Grid virtualised with `@tanstack/react-virtual`, no realtime, manual refresh, 5-minute cache keyed by scope.
- Tests: cell-eligibility and skipped-reason mapping, target-rule resolution precedence (manual override > rule > group default), cap enforcement.
- DOCUMENTATION.md and POLICY.md updated in the same change (§CONSOLE-REVIEW-RUN, §KPI-TARGET-RULES), new ADRs for each of the three parts.

## Decisions I need from you

1. **Grid orientation** — KPIs as rows and employees as columns (good when a KPI is shared org-wide), or employees as rows and KPIs as columns (good for closing out a person)? I lean KPI-rows with the employee drawer covering the other direction.
2. **Target rules dimension** — resolve by grade/level, by designation, or by "is a manager"? Whichever you pick becomes the master data the rules read.
3. **Send-back in bulk** — should a bulk send-back be allowed from the run, or must send-backs stay per employee with a written reason?

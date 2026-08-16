# Management & Audit can act in the Performance Console (once a KPI has left KRA Set)

## What changes

Today the console is read-only for everyone except Admin. Management and Audit will
become full writers inside the console, with one hard rule:

**A KPI can only be acted on once it has moved past KRA Set.** While a KPI is still in
KRA Set it is design work (targets, weightage, scoring model being set up) and stays
Admin-only. The moment self review starts, Management and Audit can act on it — at any
stage after that, not only when it is sitting in their own queue.

Acting happens through the surfaces that already exist: the Pipeline row **Open** button
takes them into the scorecard / bulk review with the normal action buttons live. No
duplicate approve/send-back engine is built inside the console.

## Who can do what

| | Admin | Management / Audit | HR PMS |
|---|---|---|---|
| Read console, Pipeline, KRA Tree, KPI Library | Yes | Yes | Yes |
| Group value entry, group approval, group definition edit | Yes | Yes, past KRA Set only | No |
| Per-employee tuning (weightage / target / frequency) | Yes | Yes, past KRA Set only | No |
| Bulk row overrides, undo an edit run | Yes | Yes, past KRA Set only | No |
| KRA Tree create / edit / archive, duplicate-merge decisions | Yes | Yes | No |
| Review actions (approve, send back, query, final score) | per role | per role, unchanged | per role |

Two rules stay untouched no matter who is acting:
- The scoring model of a KPI is group-owned — nobody can fork Yes/No or tiered scoring
  per employee (POLICY §KPI-SCORING-MODEL-GROUP-OWNED).
- Review actions themselves keep following the normal workflow and RLS rules. The console
  only decides who may open the door; the scorecard still decides what they may sign.

## A gap this fixes

`bu_console_group_write` and `bu_console_group_advance` are currently gated on the *read*
check. When the console was widened to Management / Audit / HR PMS, those two write paths
silently widened too — including HR PMS, which was never intended. Both will be moved onto
the new write gate, so HR PMS goes back to read-only and the other two get the KRA Set rule.

## Technical detail

Database (one migration):
- New `public.bu_console_can_write(_uid uuid)` — admin, management or auditor.
- New `public.bu_console_kpi_actionable(_uid uuid, _kpi_id uuid)` — true for admin; for
  management/auditor true only when `kpis.status <> 'kra_set'`. Single source of truth for
  the stage rule.
- Re-gate write RPCs from `has_role(uid,'admin')` (or, for the two above, `can_read`) onto
  `bu_console_can_write`, and add the per-KPI `kpi_actionable` check to every KPI-scoped
  write: `bu_console_group_write`, `bu_console_group_advance`,
  `bu_console_group_edit_definition`, `bu_console_row_override`,
  `bu_console_bulk_row_overrides`, `bu_console_clear_row_overrides`,
  `bu_console_undo_edit_run`, `bu_console_edit_runs_list`.
- Non-KPI writes (`bu_goal_upsert`, `bu_goal_archive`, `bu_console_decide_merge_proposal`,
  `bu_console_generate_merge_proposals`) move to `bu_console_can_write` only — they have no
  stage to test.
- Blocked rows are reported as **skipped with a reason** ("still in KRA Set"), never a
  failed run — same contract bulk overrides already use.
- Every write already writes `kpi_audit_logs` / `bu_console_edit_runs`; the actor's role is
  added to the audit metadata so Admin vs Management vs Audit edits are distinguishable.

Frontend:
- `useBuConsoleCapability()` gains `canWrite` for management/auditor and a
  `canActOnKpi(status)` helper; the read-only banner becomes an informational note for
  those tiers ("KPIs still in KRA Set are managed by Admin").
- Group action bar, per-row **Tune**, KRA Tree row actions, **New KRA**, merge decisions
  unhide for the new tiers; per-KPI affordances disable with a tooltip while the KPI is in
  KRA Set.
- Pipeline: the KRA Set stage chip stays informational; rows past it get a **Review**
  action that deep-links into the scorecard for the acting role.

Docs and tests:
- ADR-285, POLICY §CONSOLE-ACCESS-TIERS updated (supersedes the admin-only write rule),
  memory file refreshed.
- Unit tests for `canActOnKpi` across statuses and roles, plus a migration guard test that
  no console write RPC is gated on `bu_console_can_read`.

## Risk

- Widening writes to two more roles is the real risk; it is contained by the KRA Set gate,
  the unchanged scoring-model lock, unchanged review RLS, and role-stamped audit rows.
- Rollback: point `bu_console_can_write` back at `has_role(uid,'admin')` — one function,
  no data change.

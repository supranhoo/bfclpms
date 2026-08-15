# Group KPI editing from the BU Performance Console — feasibility

**Verdict: feasible.** The console already resolves a KPI group (Category → KRA → KPI title → variant → the exact employee rows) and already writes to those rows in bulk through `bu_console_group_write` / `bu_console_group_advance`, both with a dry-run preview. Adding "edit the definition for the whole group, override for one employee" reuses that same resolver and the same safety pattern. Nothing new has to be invented structurally.

## What is confirmed today

- `bu_console_tree`, `bu_console_kpi_detail`, `bu_console_group_write`, `bu_console_group_advance` all take the same scope arguments (period, year, BUs, departments, divisions, managers) plus `p_title_key` / `p_variant_key`, so a group is already an exactly-addressable set of `kpis` rows.
- Every field you named lives on `kpis` per employee row: `category_id`, `kra_name`, `kpi_title` / `kpi_description` / `kpi_formula` / `kpi_scoring_logic`, `weightage`, `target_value`, `uom`, `frequency`, `r0..r5`, `qualitative_options`, `threshold_mode`. There is no shared master row, so "update for everyone" means a controlled multi-row update — which is exactly what the console write RPCs already do.
- `kpis` carries 20 triggers, including `prevent_locked_period_updates` (period lock + status-based guards) and the frequency lock. A definition edit must respect these, not bypass them.
- For the current year: 11,520 rows are already `approved`, 373 in `hr_pms_review`, 1,130 in `manager_check`. So a group edit will almost always be a *partial* edit — some rows editable, some frozen.

## Proposed behaviour

**Group edit (default).** From the KPI row in the console, "Edit definition for group" opens a form with the split fields (Title / Description / Formula / Scoring Logic), scoring model (value / tiered / binary), weightage, target, UoM and frequency. Only fields you actually change are written — untouched fields are never overwritten.

**Mandatory dry-run.** Before applying, show the same style of preview the group value entry already uses:

- rows that will change, grouped by BU / department
- rows that are **skipped and why**: period locked, KPI past `kra_set` (already scored), frequency locked, outside your scope. Never a silent skip.
- for weightage changes: per-employee new totals, flagging anyone who leaves 100%.

**Individual override.** In the employee list of the KPI drawer, an inline edit per employee for weightage and scoring logic (and target), applying to that one row only, marked as an override so the group edit no longer overwrites it unless you tick "reset overrides".

**Category / KRA move.** Moving a group to another category or renaming the KRA is a separate, more explicit action, since it re-parents the row in the tree and affects reports. Same dry-run, same skip reasons.

## Guardrails (non-negotiable)

- Forward-only: editable periods only — a closed or locked period is a skip, not an admin bypass, unless you explicitly say otherwise.
- Rows past `kra_set` (self review submitted or later) are **not** edited by a group action. They are listed as skipped with the reason, and can be handled one by one after a rollback.
- Every changed row writes a row-level audit (who, when, field, old value, new value, group action id) so a run can be reviewed and reverted.
- Undo: each group edit gets a run id; "Undo last run" restores the previous values for rows untouched since.
- Chunked apply with server-side totals, no 1,000-row ceiling.

## Risk summary


| Area     | Risk                                                       | Mitigation                                                |
| -------- | ---------------------------------------------------------- | --------------------------------------------------------- |
| Data     | Mass overwrite of live KPI text/weightage                  | Dry-run + only-changed-fields + audit + undo run          |
| Scoring  | Weightage change breaks per-employee 100% total            | Preview per-employee totals, flag deviations before apply |
| Workflow | Editing a KPI already scored invalidates a submitted score | Rows past `kra_set` are skipped, never silently rewritten |
| Reports  | Category/KRA move changes historical grouping              | Separate explicit action, restricted to open periods      |
| Scale    | Groups of hundreds of rows                                 | Batched apply, server-side counts, progress feedback      |


## Build shape (if approved)

1. `bu_console_group_edit_definition(...)` — SECURITY DEFINER, dry-run + apply, returns per-row outcome and skip reasons; writes `bu_console_edit_runs` / `bu_console_edit_items` audit rows.
2. `bu_console_row_override(...)` — single-row weightage / target / scoring edit with the same guards and audit.
3. `bu_console_undo_edit_run(p_run_id)`.
4. UI: `GroupDefinitionEditDialog.tsx` (reusing `KpiTextSplitFields` and `KpiScoringEditor` so the Admin KPI Editor and the console stay at parity), inline override row in `KpiDetailDrawer.tsx`, run history panel.
5. Unit tests for the skip/eligibility classifier and the weightage-total preview; DOCUMENTATION.md ADR + POLICY §BU-CONSOLE-GROUP-EDIT.

## Open questions

1. Should a group edit be allowed to touch rows already at `self_review` or beyond if the admin explicitly confirms, or always hard-skip them? - Allow this. 
2. Should weightage changes be blocked when an employee would no longer total 100%, or allowed with the existing variance acknowledgement? - allow as there will be change.
3. Who can run group edits — admin only, or also BU heads within their own scope? for now this is Admin Only. 
  &nbsp;
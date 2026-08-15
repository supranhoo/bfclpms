# ADR-274a — Complete the group KPI definition editor

## What you observed is correct (verified)

- **Category / KRA are not editable in the dialog.** The backend whitelist already accepts `category_id` and `kra_name` (and `frequency`), but the dialog renders no controls for them — only title/description/formula/scoring logic, weightage, target, unit, threshold mode and R5..R0.
- **Higher / Lower is better is missing.** That direction lives in `kpis.criteria` (9,627 rows "Lower is Better", 7,987 "Higher is Better", 3,084 NULL). It is not in the group-edit whitelist at all, so it cannot be changed for a group today — even though the scoring engine reads it on every calculation.
- **Threshold mode is effectively legacy.** Across 20,698 KPI rows: 17,614 `absolute`, 3,084 NULL (all qualitative binary/tiered rows), and **zero** rows on `ratio`. The "Ratio / Percentage" option is dead legacy that only exists in the dropdown; the engine keeps the ratio branch alive purely for old data that no longer exists.

## What will be built

### 1. Missing fields in the group edit dialog
Add, in the same preview-first flow (changed fields only, skip reasons, weightage impact, undoable):
- **Category** picker (existing org/category combobox, cascaded to the console scope)
- **KRA name** field (moves the whole group under a different KRA)
- **Frequency** picker (already whitelisted server-side)
- **Direction** (`criteria`): Higher is Better / Lower is Better / Equal to Target — same option set as the Admin KPI Editor
- **Source of data** and **UoM type** stay as they are today

Moving a group's category or KRA is a structural move, so it will require the typed confirmation already used for large-scope actions, and the preview will call out the number of employees whose KRA/category changes.

### 2. Direction added to the write path
`criteria` becomes a whitelisted group-edit field and a per-employee override field, with a validation guard: if the chosen direction contradicts the R5..R0 ladder (e.g. "Higher is Better" with a descending ladder), the preview shows a warning row before commit — reusing the existing Scoring Health Check rule rather than a new one.

### 3. Threshold mode retired forward-only
- New and edited KPIs: threshold mode is fixed to **Absolute**; the "Ratio / Percentage" choice is removed from the shared scoring editor (Assign New KRA, Admin KPI Editor, group edit, per-employee override).
- Qualitative KPIs keep `threshold_mode` NULL as today.
- The engine's ratio branch stays in place untouched so any historical row is still scored identically — nothing is rewritten, no back-migration.
- The field remains visible read-only when a row somehow carries `ratio`, so it is never hidden silently.

### 4. Per-employee override parity
`RowOverrideDialog` gains the same new fields (category and KRA excluded — a single employee is moved through the normal KPI editor, not the group tool), so a group edit and a single tune expose the identical scoring surface.

## Technical notes

- Server: extend `bu_console_group_edit_definition` / `bu_console_row_override` whitelists with `criteria`; `category_id`, `kra_name`, `frequency` are already accepted, only UI is missing.
- Shared UI: `KpiScoringEditor` gains the direction selector and drops the ratio option; `kpiFormModel.buildScoringPayload` always writes `absolute` for numeric types.
- Guards unchanged: approved final scores stay immutable, rows already in review need the explicit toggle, individual overrides are respected unless reset.
- Tests: `groupEditModel.test.ts` extended for the new fields and the direction-vs-ladder warning; `kpiFormModel.test.ts` pinned to "numeric always writes absolute".
- DOCUMENTATION.md and POLICY.md updated (§BU-CONSOLE-GROUP-EDIT extended; new §KPI-THRESHOLD-MODE-ABSOLUTE-ONLY).

## Risk

- Data: additive only, no back-migration, no destructive schema change. Rollback = the existing "Undo run" per edit run.
- Regression: the scoring engine is not modified, so historical ratings cannot shift; only the admin write surface changes.

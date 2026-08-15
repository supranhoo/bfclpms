# ADR-275 — Performance Console: finish "Edit definition for the whole group"

## What is actually broken today (verified)

- **Frequency can be changed, but its cycle anchor cannot.** `bu_console_editable_fields()` returns `kpi_title, kpi_description, kpi_formula, kpi_scoring_logic, weightage, target_value, uom, uom_type, frequency, threshold_mode, qualitative_options, r5..r0, kra_name, category_id, criteria, source_of_data`. `frequency_cycle_start` is **not** in that list and there is no control for it in the dialog. So switching a group to Bi-Monthly leaves the anchor NULL or stale — the system cannot tell Jan–Feb from Feb–Mar, and the multi-month percolation trigger has nothing to anchor on. The Admin KPI Editor and Assign New KRA both have this picker plus the "covers … reviewed once in …" banner; the console silently dropped it.
- **A cycle-anchor conflict will fail as a raw database error.** `trg_enforce_intra_year_cycle_anchor_consistency` rejects an anchor overlapping an existing cycle for the same employee/KPI/year. The console has no pre-check, so a group edit hits the exception mid-run instead of listing the affected employees in the preview.
- **Other fields the console still cannot reach**, although they exist on `kpis` and are editable in the Admin KPI Editor: `day_count_type` (Daily working-days vs all-days), `is_org_level` + `org_level_scope`, `require_resubmit_reason`, `is_frequency_locked`. `sub_frequency` is maintained by the `sync_kpi_sub_frequency` trigger and stays out of the form.
- **Group vs individual is not visible.** Nothing in the dialog states which fields are shared by everyone and which are per-employee, and per-employee differences (weightage 15% vs 50%, different targets) can only be set one employee at a time through "Tune".

## What will be built

### 1. Frequency and cycle anchor, done properly
- Frequency picker gains a **cycle anchor** selector, shown only for Bi-Monthly / Quarterly / Half-Yearly / Yearly, sourced from the existing `frequencyCycleOptions` helper — the same control the Admin KPI Editor uses.
- Below it, the canonical **cycle scope banner** from `buildCycleScopeLabel(frequency, period, year, anchor)`: "covers January, February 2027 — reviewed once in February 2027", with the percolation tooltip. Never a hand-rolled month string (POLICY §54 v3 UX clause).
- `frequency_cycle_start` is added to the server whitelist, with validation: a multi-month frequency without an anchor is rejected before any write; a single-month frequency clears the anchor.
- The preview runs an **anchor conflict pre-check** per employee row and reports conflicts as a normal skip reason ("cycle overlaps an existing Feb–Mar cycle") instead of aborting the run.
- Changing frequency or anchor is treated as **structural**, so it joins category/KRA in requiring the typed confirmation, and the preview states how many review rows change cycle.

### 2. Remaining definition fields
Added to both the whitelist and the dialog, grouped under an "Advanced" section so the common case stays compact:
- **Day counting** (`day_count_type`) — only for Daily frequency
- **Organisation-level KPI** (`is_org_level` + `org_level_scope`)
- **Require reason on resubmission** (`require_resubmit_reason`)
- **Lock frequency after submission** (`is_frequency_locked`)

`ref_code`, `kpi_definition_id`, `source_template_id` and `sub_frequency` stay read-only in the console — they belong to the standardization registry and the sync triggers, and are shown as read-only chips so nothing looks missing.

### 3. Make "for everyone" vs "for this person" explicit
- Every field in the group dialog carries a small **Group** or **Per-employee default** marker. Group-owned: text split, category, KRA, frequency + anchor, direction, UoM type, qualitative options, source of data, org-level flags. Per-employee tunable: weightage, target, unit, scoring ladder, day counting.
- The employee list in the KPI drawer shows an **override chip** per row listing which fields that employee has diverged on, with a one-click "Reset to group" per field.
- The group dialog's weightage/target inputs keep "leave blank = keep each employee's own" and now say so in the marker text.

### 4. Bulk per-employee weightage and target, in one pass
The preview table becomes editable: each affected employee row gets an inline weightage and target cell pre-filled with their current value. Editing a cell converts that row into a per-employee override in the same run (so a department head at 50% and their team at 15% is one action, not eleven). Running totals per employee are recalculated live, and the existing "no longer totals 100%" warning stays.

### 5. Reuse, not reinvention
Explicitly reused: `frequencyCycleOptions` + `buildCycleScopeLabel`, `KpiScoringEditor` / `KpiScoringScale` (binary / tiered / value KPIs), `KpiTextSplitFields`, `OrgFilterCombobox` for category, `editLockReason` for why a row is skipped, the governance period-lock and approved-final-score guards, `bu_console_edit_runs` + "Undo run", and the typed-confirmation helper.

## Technical notes

- Server: extend `bu_console_editable_fields()` with `frequency_cycle_start`, `day_count_type`, `is_org_level`, `org_level_scope`, `require_resubmit_reason`, `is_frequency_locked`; add a validation block in `bu_console_group_edit_definition` and `bu_console_row_override` for the frequency/anchor pair and for `day_count_type` only on Daily. `bu_console_apply_kpi_changes` is generic and needs no change beyond boolean casting already handled by its `format_type` path.
- New helper `bu_console_cycle_anchor_conflicts(...)` mirrors `expand_cycle_window_months` so the preview can list conflicts; the existing trigger remains the last line of defence.
- Preview payload gains `cycle_change` and `anchor_conflicts` arrays; row-level bulk overrides are applied through the existing per-row path inside one edit run so Undo still reverses everything.
- Tests: `groupEditModel.test.ts` extended (anchor required for multi-month, anchor cleared for single-month, structural confirmation set, per-row weightage overrides diffed correctly), plus a pure conflict test reusing `cycleAnchorWindowConsistency.ts`.
- DOCUMENTATION.md and POLICY.md updated: §BU-CONSOLE-GROUP-EDIT extended with the group-vs-individual field matrix, and §54 v3 UX clause extended to cover the console.

## Risk

- Data: additive whitelist only, no schema change, no back-migration. Every write goes through an edit run, so rollback is the existing "Undo run".
- Regression: the scoring engine, percolation trigger and anchor trigger are untouched; the console gains a pre-check in front of them. Approved final scores stay immutable; rows past KRA-set still need the explicit toggle.
- Scale: preview and apply stay batched with no 1,000-row ceiling; the editable preview table is virtualised like the existing KRA/KPI lists.

---
name: performance-console-group-edit
description: Performance Console group/individual KPI edit scope — cycle anchor rules, editable field whitelist, bulk overrides (ADR-274/274a/275)
type: feature
---
Group edit whitelist (`public.bu_console_editable_fields()`) is the SSOT and must stay in lock-step with `GROUP_EDIT_FIELDS` in `src/hooks/useBuConsole.ts`. It covers: structured text, weightage, target, uom/uom_type, frequency + `frequency_cycle_start`, threshold_mode, qualitative_options, r5..r0, kra_name, category_id, criteria, source_of_data, day_count_type, is_org_level, org_level_scope, require_resubmit_reason, is_frequency_locked.

Invariants:
- Frequency and cycle anchor ALWAYS travel together. Multi-month (Bi-Monthly/Quarterly/Half-Yearly/Yearly) without an anchor is rejected by `bu_console_validate_changes` and by `validateCycleChange` client-side. Single-month must not carry an anchor.
- Overlapping cycles are pre-checked with `bu_console_cycle_anchor_conflict` and reported as skipped rows (`cycle_anchor_conflict` / `anchor_conflicts`) — never allowed to abort a run mid-way.
- Category / KRA moves and any cycle move require the typed confirmation.
- Per-employee tuning marks fields in `bu_console_kpi_overrides`; group edits skip them unless "reset overrides" is ticked. `bu_console_clear_row_overrides` releases them.
- Bulk tuning uses `bu_console_bulk_row_overrides` → one `bu_console_edit_runs` row (`scope_kind='row_bulk'`), undoable like any other run.
- `kpi_name` is never rewritten by the console (join key for history/reports/Org KPI matching).

Threshold mode is absolute-only forward (POLICY §KPI-THRESHOLD-MODE-ABSOLUTE-ONLY).
Tests: `src/components/admin/bu-console/groupEditModel.test.ts`.

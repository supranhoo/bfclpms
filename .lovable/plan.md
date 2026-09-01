# Close the gap: rename the legacy KPI name from the group editor

Today, editing a KPI group rewrites the structured fields (Title, Description, Formula, Scoring logic) everywhere, but the legacy display name (`kpi_name`, plus its KRA name) is deliberately left untouched. That is why Org KPI Data Entry, KPI Status Tracker and Excel exports keep showing the old wording after an edit.

This plan adds an explicit, optional, reversible rename step to the group editor so those surfaces line up too.

## What the user sees

In **Edit definition for the whole group**, below the wording fields, a new collapsible block:

- Checkbox: **Also update the legacy display name used in reports and Org KPI Data Entry** (off by default — nothing changes unless ticked).
- When ticked:
  - **New KRA name** and **New KPI name** inputs, pre-filled from the current KRA / KPI title so the common case is one click.
  - **Apply rename to months** — start and end month pickers, defaulting to the current console month through the end of the fiscal year. A note states months before May 2026 are frozen and cannot be renamed.
  - A **Preview rename** button showing a per-month table: rows to rename, locked rows, Org KPI rows. Locked-row handling matches the existing rename tool.
  - A short line confirming the rename is one reversible action, undoable from KPI Standardization.
- The dialog's existing warning text changes from "the legacy KPI name is kept as-is" to a statement matching the chosen option.
- The confirmation summary before Apply lists the rename as its own line item ("Rename 84 rows across 5 months") so it is never applied silently.

Rename runs only after the definition edit succeeds; if the rename fails, the definition changes stay and a clear error names the rename as the failed part.

## Rules

- Rename is opt-in and admin-only (server already enforces this).
- Forward-only: nothing before May 2026 can be renamed; the UI blocks earlier month selections.
- Renames touch text and definition binding only — never targets, weightages, scores or workflow status.
- Locked rows follow the existing rename tool's behaviour and are reported in the preview, not skipped silently.
- One rename = one reversible action, visible and undoable in the KPI Standardization tool.

## Technical notes

- No new database objects. Reuse the existing server functions `correct_kpis_range_dry_run` (read-only per-month counts) and `correct_kpis_range` (reversible apply, returns `action_id`), already wrapped by `src/hooks/useKpiRangeCorrection.ts`.
- `GroupDefinitionEditDialog.tsx` gains local state for the rename block and calls the hook after `useGroupEditSpanCommit` resolves, passing `categoryId`, current KRA/KPI names as the old values, the new names, and the selected range. `p_definition_id` is passed when the group is registry-bound, otherwise null.
- Month range guard uses the existing `CORRECTION_FLOOR` (202605) and `periodKey` helpers.
- Invalidate the console, scorecard and KPI-list query keys after a successful rename so both surfaces refresh together.

## Docs, policy, tests

- New ADR (ADR-334) covering the opt-in rename handoff from the group editor.
- POLICY: extend §KPI-STANDARDIZATION / §CONSOLE-TEXT-ONLY-STANDARDISATION to state that legacy-name rewrites from the console are opt-in, forward-only and reversible.
- Unit tests: rename payload built correctly from dialog state; floor guard rejects pre-May-2026 ranges; rename skipped entirely when the checkbox is off; definition-edit success is preserved when rename fails.

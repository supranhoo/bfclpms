# Group KPI editor: respect UOM types (Numeric / Binary / Tiered)

## Problem

The "Edit definition for the whole group" dialog treats unit of measure as a blank free-text box. It has no KPI type control, so a group KPI cannot be created or corrected as Numeric, Binary or Tiered from the console — even though the console already stores `uom_type`, `qualitative_options` and `threshold_mode`, and the Admin KPI editor already offers the same three types. Because the type is invisible, the R0–R5 ladder shown in the dialog is always the numeric one, whatever the KPI really is.

A second, smaller drift: the client's descriptive-field list still contains the scoring test (`kpi_scoring_logic`), while the server allowlist no longer does. The dialog therefore promises a "definition text only" run and then reports skipped rows when the scoring test is touched.

## What changes visually

In the dialog, between the KRA row and the Weightage/Target/Unit row:

- **KPI type** — the same three-card selector used in the Admin KPI editor: Numeric, Binary (Yes/No), Tiered (custom options).
- **Unit** — becomes a dropdown from the standard UOM list (%, Count, Days, Amount, …) instead of a free-text box, and is only shown for Numeric.

Type-aware behaviour below it:

- Numeric: Direction, thresholds note and the R5…R0 grid, exactly as today.
- Binary: Yes/No polarity control; the R0–R5 grid and Unit are hidden.
- Tiered: the tier options editor (label + rating 0–5); the R0–R5 grid and Unit are hidden.

Switching an existing KPI's type rewrites how every mapped employee is scored, so it is treated as a structural change: the preview flags it and the typed `APPLY` confirmation is required before commit. Target and weightage remain untouched by a type change.

## Steps

1. Render the type selector and a UOM dropdown in `GroupDefinitionEditDialog`, wired to the existing `scoring.uom_type` / `qualitative_options` state so no new state is invented.
2. Clear the fields the chosen type does not own (unit and R0–R5 for binary/tiered; qualitative options for numeric) before the change set is diffed, so an inert field never lands in the run.
3. Treat `uom_type` and `qualitative_options` as structural for confirmation purposes, alongside category/KRA and cycle moves.
4. Block a preview that is invalid for its type: tiered with no options, binary with no polarity, numeric with a missing unit when a unit was previously set.
5. Align the client descriptive-field list with the server allowlist so scoring-test edits are honestly shown as protected rather than silently skipped.
6. Extend the model tests: type-aware change sets, inert-field suppression, and structural confirmation for a type switch.

## Verification

- Numeric KPI: unit dropdown and R0–R5 present; preview writes rows as today.
- Binary/tiered KPI: ladder hidden, options editor shown, saving reflects on the employee scorecard as Yes/No or tier labels.
- Type switch: preview demands `APPLY`; cancelling leaves the KPI untouched.
- Wording-only edits still process without skipped rows.

## Technical notes

- Files: `src/components/admin/bu-console/GroupDefinitionEditDialog.tsx` (render + inert clearing), `src/components/admin/kpi-form/KpiScoringEditor.tsx` (only if the binary/tiered branch needs the polarity control surfaced), `src/components/admin/bu-console/editFieldClass.ts` (allowlist alignment), `groupEditModel.test.ts`.
- Reuses `UomTypeSelector`, `UOM_OPTIONS` and `lib/qualitativeUom` — no new scoring primitives.
- No schema change. `uom_type`, `qualitative_options` and `threshold_mode` are already console-editable fields and already validated server-side by `bu_console_validate_changes`; per-employee tuning stays barred from them (ADR-282).
- Historical scores are never recomputed; only current and future rows in the chosen span are written.
- Docs: ADR-328 plus POLICY §KPI-UOM-TYPE-GROUP-OWNED, and DOCUMENTATION.md version history.

## Rollback

The dialog controls can be reverted on their own; the field-list alignment is a one-line revert. Nothing in this change rewrites stored scores.

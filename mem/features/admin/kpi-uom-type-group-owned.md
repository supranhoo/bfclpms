---
name: kpi-uom-type-group-owned
description: KPI type (Numeric/Binary/Tiered) is group-owned and editable from the Performance Console group editor; unit list + inert ladder rules (ADR-328)
type: feature
---
The group definition editor (`GroupDefinitionEditDialog`) exposes the KPI type via the shared `UomTypeSelector` and a controlled unit dropdown from `UOM_OPTIONS`.

- Numeric: unit dropdown + Direction + R5..R0 ladder.
- Binary / Tiered: no unit, no ladder — `ladderForType()` (in `groupEditModel.ts`) blanks `r0..r5` and `uom` so stale numeric values never enter the change set.
- Existing non-standard units stay selectable as "<value> (current)".
- `uom_type` / `qualitative_options` are STRUCTURAL_FIELDS: a type switch demands the typed APPLY confirmation. Never tunable per employee (ADR-282).
- `validateScoringState` gates preview: tiered needs options, binary needs polarity, numeric needs a unit when one existed.
- `DESCRIPTIVE_FIELDS` in `editFieldClass.ts` is an exact mirror of `public.bu_console_descriptive_fields()` — it must NOT contain `kpi_scoring_logic` (ADR-327).

Tests: `groupEditModel.test.ts` (ADR-328 + ADR-327 blocks).

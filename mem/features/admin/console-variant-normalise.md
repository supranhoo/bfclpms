---
name: Console variant normaliser
description: Align dialog — wording standardisation never writes targets; target flattening is opt-in; ladder handoff (ADR-315/325)
type: feature
---
Performance Console KPI rows with the variance badge expose **Align**
(`VariantNormaliseDialog` + pure `variantNormalise.ts`).

- Variance is two classes (ADR-325): **wording** (`kpi_description`, `kpi_formula`,
  `kpi_scoring_logic`) and the **individual bar** (`target_value`).
- Default tab = *Standardise wording*: `changeSetFor(..., 'wording')` never emits a scoring field.
  Several variants left afterwards (one per distinct target) is the correct outcome.
- *Targets & bands* tab equalises targets — off by default, per-variant before/after, typed `APPLY`.
- **Never write weightage** in any normalisation.
- Badge: amber `N variants · M wording` for drift; neutral `N targets` for deliberate bars.
  Falls back to the flat `variant_count` when the payload carries no variant detail.
- `seedTiersFromVariants` (scoringLadderModel) turns target variance into ADR-324 ladder tiers:
  one tier per distinct target, highest first, single-person variants pinned to that employee.
- Orchestration only: loops `bu_console_group_edit_definition` per variant per month, ADR-291 span,
  one undoable run each. §88 immutability unchanged; wording runs use the ADR-323 descriptive bypass.
POLICY §CONSOLE-VARIANT-NORMALISE.

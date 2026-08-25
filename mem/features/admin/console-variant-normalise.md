---
name: Console variant normaliser
description: "Make this one" collapses KPI definition variants; weightage is never written (ADR-315)
type: feature
---
Performance Console KPI rows with the amber "N variants" badge expose **Make this one**
(`VariantNormaliseDialog` + pure `variantNormalise.ts`).

- Variants come from drift in 4 fields only: description, formula, scoring logic, target
  (`bu_console_variant_key`). Common real cause: description/formula written into swapped columns.
- Canonical default = most employees → most rows → most complete definition. The admin may edit the
  definition before applying, which also rewrites the canonical rows.
- **Never write weightage in a normalisation** — per-employee number, not part of variant identity.
- Only fields whose normalised (whitespace/case-insensitive) value differs are emitted; aligned
  variants are reported, not rewritten.
- Orchestration only: loops the unchanged `bu_console_group_edit_definition` RPC once per
  variant per month, reusing the ADR-291 span control. One undoable run each; stops on first error;
  typed `APPLY` confirmation. §88 immutability unchanged.
POLICY §CONSOLE-VARIANT-NORMALISE.

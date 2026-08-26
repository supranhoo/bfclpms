---
name: Console mixed group edit partitioning
description: Group definition edits split into wording (applies to locked rows) vs protected fields (withheld, partially_applied); no phantom scope diffs (ADR-326)
type: feature
---
Performance Console group definition edit (`bu_console_group_edit_definition`,
`GroupDefinitionEditDialog`):

- **Partitioned by field class (ADR-326).** Wording fields (title, description,
  criteria, source of data, formula, scoring logic, uom label) are written to every
  matching row, including rows with an approved final score or already in review.
  Protected fields (target, weightage, r5..r0, uom_type, threshold, options,
  frequency/cycle, scope) are withheld there → row reported `partially_applied`
  with `withheld_fields`. Skip only when nothing can be written.
- **No phantom changes.** `isScopeInert(orgLevel, original.is_org_level)` — when the
  KPI is not and was not org-level, `org_level_scope` and the scope-target columns
  are excluded from the change set. Stale `org_level_scope` on non-org rows exists in
  prod (a bulk cleanup is rejected by the locked-period trigger); the client gate
  makes it inert.
- Preview must name the cause per month (`GROUP_EDIT_SKIP_LABELS`) plus an
  `N wording only` count — never a bare "protected rows skipped".
- §88 immutability holds: no score, band, target or weightage moves on a locked row.
POLICY §CONSOLE-MIXED-EDIT-PARTITIONING.

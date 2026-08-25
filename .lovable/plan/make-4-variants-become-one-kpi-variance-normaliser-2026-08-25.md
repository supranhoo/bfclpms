# Make "4 variants" become one KPI (variance normaliser)

## What the variance actually is (verified)

A "variant" is not a different KPI. The console derives a variant key from four fields only:
`kpi_description`, `kpi_formula`, `kpi_scoring_logic`, `target_value` (`public.bu_console_variant_key`).

For *Power generation from 45 MWh* in July 2026 the rows split because those fields drifted, not because
the metric differs:

- description and formula are **swapped** on some rows (one set has the month-cycle text in description,
  the other has it in formula),
- scoring text differs only by wording/whitespace (`20% incentive = 5, ... 5% = 2, 0% = 1` vs
  `=>20% incentive = 5, ... 95% target achieved = 2, ...`),
- a few rows have description/formula **empty**,
- `target_value` is 20 on every row — the target is not the cause.

Weightage differs (10/12/15/25/30/35/45), which the console already reports separately as "2 values".
Weightage is a legitimate per-employee number and is **not** part of the variant key, so it must not be
flattened by this action.

## What to add

A **"Make this one"** action on the amber variance badge in the KPI row (`BuConsoleTree.tsx`), opening a
new **Normalise variants** dialog:

1. **Pick the canonical definition** — the dialog lists every variant with employee count, description,
   formula, scoring logic and target, and preselects the variant covering the most employees. The admin
   can pick any variant, or edit the four fields inline before applying (so swapped
   description/formula can be corrected once, for everyone).
2. **Preview** — a dry run per non-canonical variant showing rows to write, rows skipped with reasons
   (approved final score, already in review, individual override), and the resulting variant count (must
   read "1 variant after apply").
3. **Apply** — commits the same four-field change set to each non-canonical variant, one run per variant,
   all tagged with a shared batch id so the whole normalisation is undoable as one unit.

Guardrails kept unchanged: weightage is never touched, approved final scores stay immutable (POLICY §88),
rows past KRA-set are only included if the admin ticks the existing "include rows already in review"
option, per-employee overrides keep their exemption unless "reset overrides" is ticked, and structural
confirmation typing is required because the change hits multiple employees.

The existing **Apply to** span control (This month only / This and all future months / Next N months) is
reused, so the same normalisation can be pushed into the rest of the fiscal year in one pass.

## Technical notes

- No schema change, no RLS change. This is an orchestration layer over the existing
  `bu_console_group_edit_definition` RPC, called once per source variant key with a change set limited to
  `kpi_description`, `kpi_formula`, `kpi_scoring_logic`, `target_value`.
- New pure module `src/components/admin/bu-console/variantNormalise.ts`: group rows by variant key, pick
  the default canonical variant, build the per-variant change sets, drop variants already equal to the
  canonical, aggregate per-variant dry-run results, and compute the predicted post-apply variant count.
- New `VariantNormaliseDialog.tsx` following the `GroupDefinitionEditDialog` layout conventions
  (contained modal, `min-w-0`, wrap-safe rows — no horizontal scroll, per ADR-314).
- `useBuConsole.ts`: `useVariantNormalisePreview` / `useVariantNormaliseCommit` wrapping the existing
  group-edit mutations; existing hooks untouched. Query keys `bu-console-tree` and
  `bu-console-kpi-detail` invalidated on success.
- Recommended order stays: **Clean KPI text** (strips metadata appended to `kpi_name`) → **Normalise
  variants** (aligns the four definition fields) → **Merge Proposals** (registry-level canonical naming).

## Tests

- `variantNormalise.test.ts` — grouping by variant key, default canonical selection by employee count,
  change sets exclude weightage, no-op variants dropped, predicted count collapses to 1, aggregation of
  per-variant results, empty-field variants handled.
- Extend `consoleLayout.test.tsx` — the new dialog wraps and does not overflow horizontally.

## Docs

`docs/adr/ADR-315.md`, DOCUMENTATION.md (Performance Console → variance normalisation),
POLICY.md §CONSOLE-VARIANT-NORMALISE, version history entry.

## Risk

- Data: writes only the four definition fields on rows the preview lists; weightage, scores and targets
  in review are untouched. Worst case is a wrong canonical choice — mitigated by the mandatory preview
  and per-variant undoable runs.
- Regression: low. New action; existing single-variant edit paths are unchanged.
- Scalability: at most one RPC call per variant per month, each already paged and capped.

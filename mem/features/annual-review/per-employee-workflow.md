---
name: Annual Review Per-Employee Workflow
description: enabled_stages column, stageChain SSOT, override-safe seeder, set_annual_review_enabled_stages RPC, bulk XLSX dialog
type: feature
---

`annual_review_instances.enabled_stages` (jsonb NOT NULL, default
`["self","manager","skip_manager","bu_head","hr"]`) is the per-employee
configurable workflow. Must contain `self`; subset of the canonical 5
stages. Validated by `tg_annual_review_validate_enabled_stages` trigger.

## Resolver SSOT
`src/lib/annualReview/stageChain.ts` — `enabledChain`, `nextStatus`,
`prevStatus`, `describeChain`. UI components MUST go through this helper.
Mirror in PL/pgSQL: `annual_review_next_status`, `annual_review_prev_status`,
`annual_review_prev_role`. `advance_annual_review_status` and
`send_back_annual_review_status` both call the PL/pgSQL helpers so disabled
stages are skipped server-side.

## Mutation path
RPC `set_annual_review_enabled_stages(p_instance_id, p_enabled_stages jsonb, p_reason)`:
- admin / hr_pms only
- allowed only when `overall_status IN ('not_started','pending_self')`
- reason mandatory (≥3 chars)
- audit-logged as `annual_review.enabled_stages_set` with previous, new, reason

Service wrappers: `setEnabledStages` and `bulkSetEnabledStages` (same
sequential-loop pattern as `bulkSetTemplateOverrides`).

## Seeder safety
`writeSeedRowsPreservingOverrides` patch list excludes `enabled_stages`, so
per-employee workflow overrides survive every re-seed. INSERT path relies on
the column default. Same guarantee as `template_override_id`.

## UI
- **Employee/Team stepper**: `AnnualReviewStageTracker` now accepts
  `enabledStages` and renders only enabled stages (so a 5-circle stepper
  collapses to 2-4 circles when stages are disabled).
- **Admin → Progress**: per-row **Change workflow** dialog
  (`ChangeWorkflowDialog`) + **Bulk workflow assignment** XLSX dialog
  (`BulkWorkflowAssignmentDialog`). Columns: Employee Code, Full Name,
  Current Stages, Manager (Y/N), Skip (Y/N), BU (Y/N), HR (Y/N), Reason.
  Y/N parser accepts Y/YES/TRUE/1/X/✓ and N/NO/FALSE/0; blank cell keeps
  current value. Rows where the resulting chain equals the current one are
  Skipped in the preview.

## Tests
- `src/lib/annualReview/stageChain.test.ts` — chain + next/prev for every subset.
- `src/test/annualReview/bulkSetEnabledStages.test.ts` — normalisation, RPC
  payload, per-row failure isolation.

## Rollback
`DROP FUNCTION set_annual_review_enabled_stages(uuid, jsonb, text);` +
revert `advance_annual_review_status` and `send_back_annual_review_status`
to the prior CASE-based versions +
`ALTER TABLE annual_review_instances DROP COLUMN enabled_stages;` +
revert UI files and `stageChain.ts`. Resolver naturally collapses to "all 5
enabled" when the column is absent.
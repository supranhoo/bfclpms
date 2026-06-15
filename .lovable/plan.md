# Per-Employee Configurable Annual Review Workflow

Today every annual-review instance walks the fixed chain
`self → manager → skip → bu → hr`. We will allow Admin/HR to disable any of
`manager`, `skip_manager`, `bu_head`, `hr` for an individual employee (or in
bulk). `self` is always required. Stage **order** stays fixed — only the
set of enabled stages varies.

## Risk & Impact Report

- **Data**: One additive column on `annual_review_instances`
  (`enabled_stages jsonb`, default `["self","manager","skip_manager","bu_head","hr"]`).
  No data backfill needed — existing rows default to the full chain.
- **Workflow**: `advance_annual_review_status` and
  `send_back_annual_review_status` now compute next/prev stage from the
  per-instance enabled set instead of hardcoded CASE. Behaviour is
  identical when all stages are enabled (full back-compat).
- **UI/UX**: Employee stepper (`EmployeeAnnualReview`) and admin progress
  rows render only enabled stages. Reviewer chain UI in Team view unchanged
  for enabled stages; disabled stages never appear.
- **Regression**: Status enum unchanged. Bulk finalize (`pending_hr` only)
  still works for instances whose `hr` is enabled. Instances with `hr`
  disabled terminate at the last enabled stage (becomes `completed`
  automatically when that reviewer advances).
- **Scalability**: One JSONB column read on the same hot path that already
  reads the instance row. No new queries.
- **Mitigation**: SSOT resolver in `src/lib/annualReview/stageChain.ts`
  shared by TS UI and mirrored in PL/pgSQL inside the RPCs. Unit tests
  cover every subset.

## Pre-implementation assumptions

- `self` cannot be disabled (employee must always self-assess).
- Disabled = stage entirely skipped (advance jumps past it, snapshot
  reviewer slot stays populated but unused).
- Override allowed only while instance is in `not_started` or
  `pending_self` (same gate as template override).
- Default for net-new instances = all 5 stages enabled. Future: rule-based
  default — out of scope here.

## Plan

### 1. Schema (migration)

```sql
ALTER TABLE public.annual_review_instances
  ADD COLUMN enabled_stages jsonb NOT NULL
    DEFAULT '["self","manager","skip_manager","bu_head","hr"]'::jsonb;

-- guard: must contain 'self', subset of the 5 known roles
ALTER TABLE public.annual_review_instances
  ADD CONSTRAINT enabled_stages_valid
  CHECK (
    jsonb_typeof(enabled_stages) = 'array'
    AND enabled_stages ? 'self'
    AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements_text(enabled_stages) x
      WHERE x.value NOT IN ('self','manager','skip_manager','bu_head','hr')
    )
  );
```

### 2. SSOT resolver (`src/lib/annualReview/stageChain.ts`)

```ts
export const ALL_STAGES = ['self','manager','skip_manager','bu_head','hr'] as const;
export type StageRole = typeof ALL_STAGES[number];
export const ROLE_TO_PENDING: Record<StageRole, AnnualReviewStatus> = {
  self: 'pending_self', manager: 'pending_manager',
  skip_manager: 'pending_skip', bu_head: 'pending_bu', hr: 'pending_hr',
};
export function enabledChain(enabled: StageRole[]): StageRole[] { ... }
export function nextStatus(current, enabled): AnnualReviewStatus { ... }
export function prevStatus(currentRole, enabled): AnnualReviewStatus { ... }
```

### 3. RPC updates (same migration)

Rewrite `advance_annual_review_status` and `send_back_annual_review_status`
to read `v_inst.enabled_stages` and compute next/prev by index lookup
instead of fixed CASE. If `hr` is disabled, advancing past the last
enabled reviewer sets status to `completed` and stamps `finalized_at`.

New RPC mirroring `set_annual_review_template_override`:

```
set_annual_review_enabled_stages(
  p_instance_id uuid,
  p_enabled_stages jsonb,
  p_reason text
)
```
- admin/hr_pms only, status must be `not_started`/`pending_self`,
  must contain `self`, reason ≥ 3 chars, audit-logged as
  `annual_review.enabled_stages_set`.

### 4. Service layer
`src/services/annualReview/annualReviewService.ts`
- `setEnabledStages({ instanceId, enabledStages, reason })`
- `bulkSetEnabledStages(rows)` — sequential loop mirroring
  `bulkSetTemplateOverrides`.

### 5. UI

- **EmployeeAnnualReview stepper** — filter steps by
  `instance.enabled_stages` so disabled stages disappear (the screenshot
  would show 4 dots instead of 5 when, say, BU Head is disabled).
- **AnnualReviewAdmin → Progress tab** — add **"Change workflow"** row
  action next to **"Change template"** (same enable gate). Opens
  `ChangeWorkflowDialog` with 4 checkboxes (Manager, Skip, BU, HR) plus
  required reason.
- **Bulk button** **"Bulk workflow assignment"** next to the existing
  bulk template button. New `BulkWorkflowAssignmentDialog` reuses the
  XLSX preview/apply pattern. Columns:
  `Employee Code | Full Name | Current Stages | Manager (Y/N) | Skip (Y/N) | BU (Y/N) | HR (Y/N) | Reason`.

### 6. Tests

- `src/lib/annualReview/stageChain.test.ts` — every subset → next/prev.
- `src/test/annualReview/setEnabledStages.test.ts` — RPC wrapper happy +
  permission/stage-gate paths.
- `src/test/annualReview/bulkSetEnabledStages.test.ts` — per-row failure
  isolation.

### 7. Documentation & memory

- `src/modules/annual-review/POLICY.md` — new "Per-employee workflow"
  section, gates, bulk usage, rollback note.
- `src/modules/annual-review/DOCUMENTATION.md` — column, resolver,
  RPC contracts, version-history entry.
- `mem/features/annual-review/per-employee-workflow.md` — new memory
  file; add to `mem/index.md`.

## Rollback

```
DROP FUNCTION set_annual_review_enabled_stages(uuid, jsonb, text);
-- revert advance/send_back RPCs to the previous CASE-based versions
ALTER TABLE annual_review_instances DROP COLUMN enabled_stages;
```
plus revert UI files and service helpers. Resolver collapses to "all
enabled" naturally.

## Not Applicable
- No schema change to reviewer-chain snapshot columns.
- No change to scoring, eligibility, reminders, or report scope.

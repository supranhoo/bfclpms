## Goal

Make the Self stage optional in the per-employee annual-review chain, the same way Manager / Skip / BU / HR already are. Today `self` is hard-pinned across SSOT, DB trigger, RPCs, UI dialog, and bulk uploader.

## Risk & Impact

- **Data**: Existing rows keep their `["self",...]` default — additive change. Re-seeder already preserves `enabled_stages`.
- **Workflow**: Excluding self means the cycle starts at the first enabled stage (Manager / Skip / BU / HR). Reviewers will see no self-score / self-remarks for that employee. Send-back from the first enabled stage stays blocked (no prior stage).
- **Lifecycle gate**: `set_annual_review_enabled_stages` is currently allowed in `not_started` OR `pending_self`. Once Self is excluded the instance's `overall_status` is whatever the new first stage is (e.g. `pending_manager`), so the gate must be widened — but only for instances that have **not yet been actioned by any reviewer** (no submissions, no completed stage). We'll gate on `overall_status = 'not_started'` OR (`overall_status = first_enabled_pending_status` AND no `annual_review_responses` rows exist).
- **Regression**: Low. All other paths (auto-advance, send-back, reminders, reports) already key off `enabled_stages` via the resolver helpers.
- **Scalability**: No new queries on hot paths; one extra `EXISTS` check on `annual_review_responses` inside the RPC.

## Plan

### 1. SSOT — `src/lib/annualReview/stageChain.ts`
- Remove `set.add('self')` force-include in `enabledChain`.
- Keep canonical ordering. Empty subset is invalid → throw in `enabledChain` if the resulting array is empty.
- Update JSDoc: "Self is no longer mandatory; chain must contain at least one stage."
- `nextStatus` / `prevStatus` are already chain-driven and need no changes once `self` may be absent.

### 2. DB — new migration `…_allow_self_exclusion.sql`
- **Trigger** `tg_annual_review_validate_enabled_stages`: drop the `enabled_stages ? 'self'` check; replace with `jsonb_array_length(enabled_stages) >= 1`.
- **RPC** `set_annual_review_enabled_stages`:
  - Drop `NOT (... ? 'self')` payload check; require array length ≥ 1 and subset of canonical stages.
  - Widen lifecycle gate: allow when `overall_status = 'not_started'` OR (`overall_status` equals the pending status of the current first enabled stage AND `NOT EXISTS (SELECT 1 FROM annual_review_responses WHERE instance_id = p_instance_id)`).
  - Audit log unchanged (`annual_review.enabled_stages_set`).
- **Start path**: locate where instances move from `not_started` → `pending_self` (cycle start trigger / RPC found in `20260613173449_*.sql`). Use the existing PL/pgSQL helper `annual_review_next_status('not_started', enabled_stages)` so the first stage is honoured. If a `not_started → pending_self` literal exists, replace with the helper call. Confirms self-exclusion produces e.g. `pending_manager` directly.
- **Auto-complete**: no change needed; `annual_review_next_status` already returns `completed` when no further stages.

### 3. UI — `src/components/annual-review/ChangeWorkflowDialog.tsx`
- Move `Self Review` into the same toggle list as the others; drop the "Required" badge and the always-on disabled checkbox.
- Guard: `canSave = isDirty && reason.length ≥ 3 && enabled.size ≥ 1`.
- Warning banner when `!enabled.has('self')`: "Self Review is disabled — the employee will not be asked to fill self ratings; reviewers start directly at <first stage>."
- Recompute `next` via `enabledChain` (now self-optional).

### 4. UI — `src/components/annual-review/BulkWorkflowAssignmentDialog.tsx`
- Add a `Self (Y/N)` column to the template, parser, and preview grid.
- Preview shows new chain via `describeChain`; rows with empty Self default to `Y` (back-compat).
- Reject rows where all five toggles end up `N`.

### 5. Service / types
- `src/services/annualReview/annualReviewService.ts` `setEnabledStages` / `bulkSetEnabledStages`: no logic change beyond passing whatever subset the dialog produced. Error mapping already surfaces the new RPC error strings.
- `src/types/annualReview.ts`: no enum change; `self` is already part of `AnnualReviewerRole`.

### 6. Tests
- `src/lib/annualReview/stageChain.test.ts` — add cases for `['manager','hr']`, `['hr']`, empty (throws).
- `src/test/annualReview/bulkSetEnabledStages.test.ts` — Self column parsing, all-N row rejection, payload sent without `self`.
- New `src/test/annualReview/setEnabledStagesSelfOptional.test.ts` — RPC contract test (mock supabase) covering: self-removed payload accepted; empty payload rejected; gate denies when responses exist.

### 7. Docs & memory
- `src/modules/annual-review/POLICY.md` — replace "Self is mandatory" with "Chain must contain ≥ 1 stage; excluding Self skips self-rating capture and starts the cycle at the next enabled stage."
- `src/modules/annual-review/DOCUMENTATION.md` — update the workflow section + add lifecycle gate clarification.
- `mem/features/annual-review/per-employee-workflow.md` — replace the "self always required" line; note the widened RPC gate.

### 8. Rollback
Revert the migration (recreates `? 'self'` check and narrower gate) + revert the four files in §1, §3, §4. No data backfill needed — existing `enabled_stages` arrays that include `self` remain valid under both schemas.

## UI changes (visual)

- **Dialog**: `Self Review` row becomes a normal checkbox (no "Required" badge, no disabled state). When unticked, an inline amber callout appears under the chain preview reading "Self Review disabled — <Employee> will not submit self ratings."
- **Bulk dialog**: new `Self` column in the XLSX template and preview table, positioned before `Manager`.
- No layout, navigation, or responsive changes.

## Out of scope

- Backfilling historical instances.
- Changing what self responses already submitted look like for downstream reviewers (none exist when self is excluded pre-start).
- Reminder copy tweaks — existing templates already key off the current pending stage.

## Why Brundaban's submission failed

Instance `2876e38f…` for employee `ffe76b92…`:
- `enabled_stages = [self, dept_head, bu_head]`
- `dept_head_id = bu_head_id = bdf687d4…` (Brundaban — both Dept and BU head)
- `overall_status = pending_dept`
- Responses: `self` locked; `dept_head` draft (Brundaban's); no `bu_head` row.

### 5 Whys
1. **Why the toast?** `tg_annual_review_guard_completion` raised ADR-127b — the completion invariant found no locked response for terminal stage `bu_head`.
2. **Why did `overall_status` jump to `completed`?** `advance_annual_review_status('dept_head')` called `annual_review_next_status(effective_chain, 'pending_dept')`, and `effective_chain = [self, bu_head]` (dept_head skipped as a **duplicate reviewer**, BU wins per seniority in `annual_review_effective_chain_details`). `dept_head` isn't in that chain → helper returns `'completed'`.
3. **Why no `bu_head` locked response?** The RPC only locks the response row for `p_reviewer_role = dept_head`; nothing mirrors the lock onto the surviving higher stage when a duplicate collapse happens at submit time.
4. **Why is `dept_head` still in `enabled_stages`?** Instance was created/seeded before the BU-head-terminal normalizer (ADR-109 `enforce_bu_head_terminal_stage`) fired for it, so the redundant slot was never stripped.
5. **Why did the guard catch it instead of the RPC preventing it?** ADR-127b (correctly) refuses to silently mark instances complete without evidence at the terminal stage — the RPC just isn't producing that evidence in the collapse case.

**Root cause:** `advance_annual_review_status` doesn't reconcile the submitted role with the effective-chain's surviving terminal role when the same person heads both stages. The dept_head submission is treated as satisfying dept_head, but the surviving terminal `bu_head` row is never locked — so the completion guard fails.

## Impact scan

Any instance where two consecutive stages share a reviewer and the lower stage is the one currently pending. Query to enumerate:
```
enabled has both dept_head and bu_head AND dept_head_id = bu_head_id
  AND overall_status = 'pending_dept'
```
Same shape applies to `manager=skip_manager`, `skip_manager=dept_head`, `dept_head=bu_head`, `bu_head=hr` — anywhere the higher tier wins the dedupe. Brundaban's instance is the reported case; sweep will find the rest.

## Fix plan

### 1. Server RPC — mirror lock onto surviving terminal (SSOT change)
Patch `advance_annual_review_status` (new migration) so that when, after locking `p_reviewer_role`:
- `v_next = 'completed'`, AND
- the terminal stage in `annual_review_effective_chain_details` (highest non-skipped) is a **different** role than `p_reviewer_role`, AND
- that terminal role's reviewer_id equals the caller (duplicate-reviewer collapse — safety check),

then UPSERT an `annual_review_responses` row for `(instance_id, terminal_role)` with `is_locked=true`, `submitted_at=now()`, copy `criteria_scores`/`weighted_score`/`comments` from the just-locked lower-stage row, and audit as `annual_review.duplicate_reviewer_mirror` with `{from_role, to_role, reviewer_id}`. Everything else in the RPC (ADR-124 final-summary persistence) stays as-is.

This makes the guard's evidence check pass, keeps a real audit trail, and stops the RPC from ever raising ADR-127b for a legitimate submission.

### 2. Data repair for existing pending instances
Same migration:
- For all `pending_dept` instances where `dept_head_id = bu_head_id`, strip `dept_head` from `enabled_stages` (aligns with POLICY §AR-BU-HEAD-TERMINAL) and set `overall_status = 'pending_bu'`. Log each row in `system_audit_logs` (`annual_review.bu_terminal_normalized`).
- Same treatment for the sibling collapses (`skip=dept`, `manager=skip`, `bu=hr`) — strip the lower duplicate on any currently-pending row where the lower stage is where the review is stuck.
- Existing `pending_bu` / `pending_hr` rows already have the higher role active, so no state change needed for them; the RPC change alone handles their submit.

### 3. Regression tests
- `src/test/annualReview/duplicateReviewerCollapse.test.ts` — asserts the new migration file defines the mirror UPSERT (matches on `INSERT INTO public.annual_review_responses … ON CONFLICT` inside `advance_annual_review_status`) and audits `annual_review.duplicate_reviewer_mirror`.
- Extend `src/lib/annualReview/rollbackTerminalStage.test.ts` mental model note in code comment — no logic change there; rollback already handles collapse via ADR-136.

### 4. Documentation
- New ADR `ADR-137 — Duplicate-reviewer collapse mirrors lock onto surviving terminal stage`.
- POLICY.md — add §AR-DUPLICATE-COLLAPSE-MIRROR under the AR-BU-HEAD-TERMINAL family.
- CHANGELOG entry.

## UI impact
None. No component, prop, or route changes. Brundaban re-clicks Submit after the migration runs; the review completes and the final summary is persisted via ADR-124's existing path.

## Rollback
Prior `advance_annual_review_status` is retained in migration history; a rollback migration can re-`CREATE OR REPLACE` the pre-ADR-137 body. The data-repair `UPDATE`s are additive-normalizing (dropping a redundant stage where the reviewer is identical); reverting `enabled_stages` back to include `dept_head` is a one-liner if ever needed.

## Risk & scalability
- Data impact: `enabled_stages` and `overall_status` are updated only on the narrow set matched by the dedupe query — expected < 100 rows.
- Workflow impact: none for stages that already worked; the collapse case now completes instead of erroring.
- Regression risk: low — mirror only fires when `v_next='completed'` AND terminal role differs AND same reviewer; ADR-127b still guards every other path.

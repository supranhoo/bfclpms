## What happened (verified from data)

Instance `febfb82a…` for Chandan Kumar Pandit (101885), cycle `b82a935f…`:

- On **31-Jul-2026 04:58 UTC** a force-reset with reason **"EXCLUDED CHANDAN"** ran against this instance.
- The archive row (`annual_review_reset_archive` id `057a37ce…`) shows the pre-reset state: `prior_status = pending_bu`, `prior_template_id = a6e88cd5…`, and one wiped response — the **self** response, `is_locked = true`, `submitted_at = 2026-07-17 11:34:04`, with 12 qualitative answers (`f_*` keys), empty `criteria_scores`, `weighted_score = 0`.
- Current state: `overall_status = pending_self`, `template_id = eb87efa6…` ("Generic W - (With KRA)"), **zero rows** in `annual_review_responses`. So the self-review content survives only in the archive.
- `enabled_stages` is `["self","bu_head"]` — unchanged by the reset.
- `bu_head_id` is currently `79fe4ca0…` (the 24-Jul Management remap), not the old self-as-BU-Head value.

Decisions confirmed with you: **full rollback to pre-reset**, but **keep the current BU Head**.

## Target end state

| Field | Restore to |
|---|---|
| `template_id` | `a6e88cd5…` (original, so the saved `f_*` answers render) |
| self response | re-inserted verbatim from archive, `is_locked = true`, original `submitted_at`/`created_at` |
| `overall_status` | `pending_bu` (BU Head Review Pending) |
| `bu_head_id` | unchanged (`79fe4ca0…`) |
| aggregates (`total_score`, `criteria_weighted_score`, `final_rating`, `finalized_*`) | stay NULL — correct for a mid-workflow `pending_bu` instance |

## Steps

1. **Pre-flight reads** (no writes): confirm template `a6e88cd5…` still exists and is usable, confirm no response rows have appeared since, confirm no `annual_review_assignment_overrides` or `template_override_id` conflict with restoring `template_id`.
2. **Restore in one transaction** (data change, not a schema migration):
   - Insert the self response back into `annual_review_responses` straight from the archive JSON (same `id`, `reviewer_id`, `reviewer_role='self'`, `qualitative_responses`, `criteria_scores`, `evidence`, timestamps, `is_locked = true`).
   - Set `template_id = a6e88cd5…` on the instance.
   - Set `overall_status = 'pending_bu'`.
   - Leave `bu_head_id` and `enabled_stages` untouched.
3. **Trigger considerations**: `trg_ar_no_downstream_rewind` (ADR-184) only blocks *rewinds* past an actioned later stage — moving `pending_self → pending_bu` is forward, no bypass flag needed. ADR-172's `trg_ar_stage_score_required` is submission-time only and this template's self stage is narrative (zero criteria), matching ADR-197. If the template-immutability trigger from ADR-117 objects, it applies only when a `template_override_id` exists — none here, verified.
4. **Audit trail**: write the before/after snapshot into a dated repair table `annual_review_self_restore_repair_2026_07` (instance id, employee, prior status/template, restored response id, reason, `performed_by = NULL` since this is a system-run repair), consistent with ADR-183/185 repair practice. The original archive row is left intact.
5. **Verification queries**: re-read the instance + responses and confirm status `pending_bu`, one locked self response with the 17-Jul submitted_at, template `a6e88cd5…`, and that the BU Head (`79fe4ca0…`) sees it in `get_my_annual_review_queue`.
6. **Docs/policy sync**: add **ADR-210 — Reset rollback from `annual_review_reset_archive`** and **POLICY §AR-RESET-ROLLBACK**, stating that force-reset archives are the authoritative rollback source and that a restore must re-anchor `overall_status` to the archived `prior_status` (re-validated against current `enabled_stages`) rather than leaving the instance at `pending_self`.
7. **Regression test**: `src/test/annualReview/resetRollback.test.ts` covering archive→response reconstruction, status re-anchoring, and the "keep current reviewer mapping" rule.

## Risk & impact

- **Data impact**: one instance, one response row re-inserted, one dated audit row created. Additive; no schema change.
- **Workflow impact**: the review re-enters the BU Head's queue; employee loses the (unwanted) editable self stage.
- **Regression risk**: low — scoped to a single instance id, no shared function or trigger is modified.
- **Rollback**: delete the restored response row and set the instance back to `pending_self` / template `eb87efa6…`; the dated audit table holds the exact before-state.
- **Open item to flag**: whoever ran "EXCLUDED CHANDAN" may have intended to exclude this employee from the cycle. This restore assumes that was a mistake, per your message. If exclusion was actually intended, the correct action is `bulk_exclude_annual_review_instances`, not a reset — I will not do that here.

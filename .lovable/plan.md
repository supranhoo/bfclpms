## Confirmed issue (verified, not assumed)

Employee: **Umesh Kumar Singh (100600)**, instance `89ca37ec-fcf2-42c4-857a-f8e349a21b78`, cycle `b82a935f…`.

Verified state from the database:
- `overall_status = 'pending_self'`, `enabled_stages = ["self"]`, all reviewer ids (`manager_id`, `dept_head_id`, `bu_head_id`, `hr_id`, `management_id`) NULL.
- His `self` response **exists, is submitted and locked** (2026-07-23 12:18), but with `criteria_scores = {}` and `weighted_score = 0.00`.
- Audit trail 2026-07-24: two `management_stage.reverted*` entries (ADR-152 cleanup) stripped `management` from the chain and pushed status backwards `pending_bu → pending_self`.

Result: the self stage is locked *and* current, and there is no downstream stage — the form renders read-only and the review can never advance. This is a single-instance data-repair case, not a systemic trigger defect.

Resolved requirements from you:
- Correct chain = **Self → BU Head (Piyush Bansal, 100076)** — his actual reporting manager, himself a BU Head.
- He should be allowed to **re-do his self scoring** before it moves forward.

## Fix

1. **Pre-flight re-verify** (read-only): re-confirm the instance is still `pending_self` / `["self"]` and that only one `self` response row exists. Abort if anything changed since this check.

2. **Repair the instance** (data update, via the insert tool — no schema change):
   - `enabled_stages = ["self","bu_head"]`
   - `bu_head_id = <Piyush Bansal, 100076>`
   - `overall_status = 'pending_self'` (unchanged — he rescores first)
   - clear `total_score` / `final_rating` so the score recomputes on advance
   - `updated_at = now()`

3. **Unlock his self response** so he can rescore:
   - `annual_review_responses` row `7f894655…`: `is_locked = false`, `submitted_at = NULL`.
   - Qualitative narrative answers are preserved untouched; only the lock and submission stamp are cleared, so nothing he wrote is lost.

4. **Audit entry**: one row in `annual_review_access_audit` with `action = 'workflow_edited_post_action'` (an allowed value under the table's CHECK constraint), `target_user_id = Umesh`, `before`/`after` capturing chain + status + lock state, and a `reason` naming this repair and the ADR-152 revert that caused it. `actor_id = NULL` per the system-performer attribution rule.

5. **Verify after the write**: re-query the instance and response; confirm chain `["self","bu_head"]`, `bu_head_id` = Piyush, self response unlocked, and that `get_my_annual_review_queue` surfaces the item for Piyush once Umesh submits.

## Risk & impact

- **Data impact**: two single-row updates plus one audit insert. No schema change, no other instance touched. Historical narrative content preserved.
- **Workflow impact**: Umesh regains an editable self form; on submit the review routes to Piyush Bansal instead of dead-ending.
- **Regression risk**: low — scoped by instance id. One watch-point: the `enforce_bu_head_terminal_stage` / management-terminal triggers must not re-strip `bu_head` on write. The verify step in 5 catches that immediately; if a trigger reverts the chain, I stop and report rather than fighting the trigger with more writes.
- **Rollback**: restore `enabled_stages = ["self"]`, `bu_head_id = NULL`, re-lock the response with `submitted_at = '2026-07-23 12:18:14.510111+00'`, and delete the audit row by id.

## Docs

- `DOCUMENTATION.md`: version-history entry recording the repair and the ADR-152 revert that caused it.
- `POLICY.md`: one-line addition under the annual-review section — an ADR-152-style revert must never leave an instance with a locked terminal-and-current stage; if the revert strips the only downstream stage, the self response must be unlocked in the same operation.

## Not doing

No new trigger, no migration, no sweep across other instances. A scan of the cycle showed only this one instance in the locked-self / self-only-chain state, so a broad job would risk disturbing the 2 legitimately `excluded` and 1 legitimately `completed` self-only rows.
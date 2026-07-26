## Umesh is right — and my previous diagnosis was partly wrong

Verified from the database just now:

- His template `a6e88cd5…` has **`criteria: []`** — zero scoreable criteria. It has **11 narrative self-review fields** and **one system score** (`carry_kra`, weight 100, Sep–Jun aggregation).
- Across **all 143 self responses** on this template, **0 have any `criteria_scores`** and 140 are locked. Empty `criteria_scores` is *normal* here, not data loss.
- His response `7f894655…` holds all 11 narrative answers (3,015 chars), intact, and was submitted 2026-07-23 12:18.

So there was never any missing self scoring, and nothing was wiped. `weighted_score = 0.00` is simply because the self stage has no criteria — his score comes entirely from the `carry_kra` system score, which is currently `{}` (never hydrated).

**What actually needs correcting is my own repair from the last turn**: I unlocked his response and cleared `submitted_at` on the assumption he had to rescore. That was unnecessary and it un-did his real submission. He should be restored, not asked to redo anything.

## Fix

1. **Pre-flight re-verify** (read-only): confirm the instance is still `pending_self` with `enabled_stages = ["self","bu_head"]`, `bu_head_id` = Piyush Bansal, and that the response is still unlocked with all 11 narrative answers present. Abort if he has already re-submitted himself in the meantime (in that case nothing to restore — just advance).

2. **Restore the original submission** (data update, no schema change) on response `7f894655…`:
   - `submitted_at = '2026-07-23 12:18:14.510111+00'` (his original stamp, from audit row 357's `before` block)
   - `is_locked = true`
   - `criteria_scores` and narrative answers left exactly as they are

3. **Advance the instance to the BU Head stage**: `overall_status = 'pending_bu'`, chain stays `["self","bu_head"]`, `bu_head_id` stays Piyush Bansal (100076).

4. **Hydrate his system score** via the existing `hydrate_annual_review_system_scores(instance_id)` RPC so the `carry_kra` (Sep–Jun, excl. N/A) value populates and `total_score` / `final_rating` compute from the real KRA data instead of showing 0.

5. **Audit + verify**: one `annual_review_access_audit` row (`workflow_edited_post_action`, `actor_id = NULL` per system-attribution rule) recording the restore and referencing audit row 357 as the action being corrected. Then re-query: response locked with the original stamp, status `pending_bu`, system score non-empty, and the item visible in `get_my_annual_review_queue` for Piyush Bansal.

## Risk & impact

- **Data impact**: two single-row updates + one audit insert + one hydrate call, all scoped to instance `89ca37ec…`. No other employee touched. No content rewritten — only lock/stamp/status restored.
- **Workflow impact**: Umesh stops seeing a form he has no reason to refill; the review sits with Piyush Bansal as intended.
- **Regression risk**: low. Watch-point: the BU/management terminal triggers must not re-strip `bu_head` on write — step 5 catches that; if a trigger reverts the chain I stop and report rather than fighting it.
- **Rollback**: set `is_locked = false`, `submitted_at = NULL`, `overall_status = 'pending_self'`, delete the new audit row by id.

## Correction to the policy I added last turn

§AR-STAGE-REVERT-NO-DEAD-END stays (the dead-end it describes was real), but it needs one amendment: the remedy for a locked-and-terminal current stage is **attach the correct downstream reviewer first**, and unlock the response *only* when the template actually has self-scored criteria. For narrative-only templates, unlocking destroys a valid submission with nothing to regain. I'll add a companion note — §AR-TEMPLATE-NARRATIVE-ONLY — stating that empty `criteria_scores` is not evidence of an incomplete self review; the template's `sections->'criteria'` must be checked before any "rescore" repair.

## Docs

- `POLICY.md`: amend §AR-STAGE-REVERT-NO-DEAD-END and add §AR-TEMPLATE-NARRATIVE-ONLY.
- `DOCUMENTATION.md`: v2.66.170 version-history entry recording the restore and the corrected diagnosis.
- Unit test for a small pure helper (`templateHasSelfCriteria`) covering narrative-only vs criteria-bearing templates, so no future repair repeats this.

## Not doing

No sweep across the other 142 instances on this template — they are all in the same (correct) empty-criteria state, and none are dead-ended. No trigger and no migration.

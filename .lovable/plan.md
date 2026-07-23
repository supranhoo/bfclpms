
## Confirmed findings (from live DB)

- **Jaspal (101125)** — instance `01f168dd…`
  - `overall_status = completed`, `total_score = 89.74`, `final_rating = Outstanding`
  - `enabled_stages = ['self','bu_head']`, `management_id = NULL`
  - Reporting manager = **Gaurav Budhia (100001)**, who carries the `management` role ✅
- Same pattern across Gaurav's direct reports: e.g. Nitesh Baldwa, Yogesh Trikha, Piyush Bansal, Sajid Raza, Rishi Juneja, Arun Goswami, Abhas Luharuwalla, Jitendra Dwivedi, Bhaskar Sharma, Dinesh Chaudhary, Binay Singh, etc. Some are already `completed` without ever routing to management; others are still `pending_*`.
- The ADR-138 auto-assign trigger only fires on **row writes to `annual_review_instances`**. These rows were created / advanced **before** ADR-138 shipped, so `enabled_stages` and `management_id` were never rewritten — the trigger never re-seeded historic rows.

Root cause (one-line): ADR-138 was a forward-only trigger; there is no backfill/re-seed for instances that existed prior to its deployment or that had already terminated at BU Head.

## Risk & Impact

- **Data**: touches `annual_review_instances` for Gaurav's direct reports only. Additive change to `enabled_stages` + `management_id`. For `completed` rows we also demote `overall_status` back to `pending_management` and clear `total_score` / `final_rating` (values will be re-persisted after management submits). Full snapshot archived to `annual_review_reset_archive` before any mutation.
- **Workflow**: employees whose reviews were "closed" will re-appear in Gaurav's Management queue. Employees themselves see no regression — self stage stays locked.
- **Regression**: unrelated instances (other BU Heads, non-Gaurav chains) are excluded by the WHERE filter. Trigger `enforce_bu_head_terminal_stage` (from earlier ADR) is compatible — management is appended after `bu_head`, not before.
- **Scalability**: ~20 rows; trivial.
- **Rollback**: `annual_review_reset_archive` snapshot allows per-row restore.

## Plan

1. **Diagnostic RPC** — add `get_management_seeding_gaps(management_uid)` returning:
   `employee_code, name, instance_id, overall_status, has_management_stage, bu_head_id, needs_reopen (bool)`.
   Callable from Admin → Annual Review → Access Control.

2. **Backfill RPC** — `backfill_management_stage_for_manager(management_uid, dry_run bool)`:
   - Snapshot every affected instance into `annual_review_reset_archive` with reason `ADR-138-BACKFILL`.
   - For each direct report of `management_uid` where `management_id IS NULL`:
     - Set `management_id = management_uid`.
     - Append `'management'` to `enabled_stages` if missing.
     - If `overall_status = 'completed'`: set `overall_status = 'pending_management'`, clear `total_score`, `final_rating`, `finalized_at` (keep response rows intact).
     - If mid-flow (`pending_bu`, etc.): leave status untouched — the existing advance RPC will now route through management on the next `advance` call.
   - Write one row per instance to `annual_review_access_audit` (`event = 'management_stage.backfilled'`).
   - Emit a summary payload (count of rows updated, reopened).

3. **Repair the seeder itself (root-cause fix)** — inside `create_or_get_annual_review_instance` and the reviewer-reseed path, apply the same "if reporting_manager carries `management` role → append `management` stage" logic unconditionally on every write, not just on insert. This makes ADR-138 idempotent for all future cycles.

4. **Admin UI (Access Control tab)** — new card **"Management stage backfill"**:
   - Manager picker (defaults to current user if they hold the `management` role).
   - "Preview gaps" → calls diagnostic RPC, renders table.
   - "Run backfill" → confirm dialog listing (a) rows to be reopened from completed, (b) rows to be augmented only. Calls RPC with `dry_run=false`.
   - Post-run toast + audit log link.

5. **Verify** — after running the backfill for Gaurav:
   - Jaspal's instance shows `overall_status = pending_management`, `management_id = Gaurav`, `enabled_stages = ['self','bu_head','management']`.
   - Gaurav's Management queue lists Jaspal + peers.
   - Run diagnostic RPC again → zero gaps.

## Docs

- **POLICY §AR-MGMT-BACKFILL (ADR-148)** — historic instances must be reconciled whenever a new terminal stage is added; seeder must be idempotent on every write.
- **DOCUMENTATION.md** — describe the diagnostic + backfill RPCs and the Admin card.

## Not doing

- No change to Self / BU response data.
- No change to notification guard.
- No global re-seed across other management-role users unless requested — the Admin card lets you run it per-manager on demand.

## Open question

Do you want the backfill to **reopen completed rows** (default in this plan, so management actually reviews them), or only **stamp `management_id` / `enabled_stages`** and leave completed rows closed as historical? First option is safer for policy compliance; second is faster and non-disruptive.

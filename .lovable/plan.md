# Goal

1. Every BU Head whose `reporting_manager_id` points to a user with the `management` role must have `management` appended to `enabled_stages` and `management_id` stamped on their annual-review instance.
2. Those Management users must be able to see the instance in **Annual Reviews (Team) → Management** and open it in edit mode to score / approve.

Both pieces already exist in code (ADR-138, ADR-148, ADR-149); the gap is that the last bulk backfill run didn't finish, so 11 `pending_management` instances still have `management_id = NULL` and `enabled_stages` without `'management'`.

---

# Verified current state (from DB reads this turn)

| Bucket | Count |
|---|---|
| `overall_status='pending_management'` correctly stamped to Gaurav Budhia | 4 |
| `overall_status='pending_management'` with `management_id = NULL` | 11 (10 report to Gaurav, 1 → Jaspal reports to "Dummy") |
| Jaspal (101125) instance `01f168dd-…` | `enabled_stages = ['self','bu_head']`, `management_id = NULL` |
| Users carrying `management` role | Gaurav Budhia (100001), Dummy (001) |

RPC `backfill_management_stage_for_manager` and the bulk wrapper `backfill_management_stage_all` are deployed. Validator + audit check-constraint now accept `management` / `management_stage.backfilled(_bulk)`. Queue RPC `get_my_annual_review_queue` already supports the `management` scope, and `TeamAnnualReview.tsx` shows the Management filter chip.

So the code path is complete — the data just hasn't been re-stamped since the earlier failed run.

---

# Plan

### Step 1 — Data fix: finish the Management backfill
Run the existing admin RPC (via **Admin → Annual Review → Access Control → Backfill all Management users**):
- `p_dry_run = false`
- `p_reopen_completed = true` (so any BU-Head instance already at `completed` moves back to `pending_management`)
- Reason: `ADR-148 rollout completion — stamp management_id + enabled_stages for all BU Heads reporting to Management`

Expected effect:
- All 11 NULL rows get `management_id` set to their `reporting_manager_id` (10 → Gaurav, 1 → Dummy/Jaspal).
- `enabled_stages` gets `'management'` appended.
- Any already-completed BU-Head rows for these managers are reopened to `pending_management` with `total_score / final_rating / finalized_at` cleared and archived to `annual_review_reset_archive`.

**Verification query (read-only):**
```sql
SELECT overall_status, management_id, count(*)
FROM annual_review_instances
WHERE overall_status = 'pending_management'
GROUP BY 1,2;
```
Success = zero rows with `management_id IS NULL`.

### Step 2 — Data hygiene: confirm Jaspal's Management routing
Jaspal (101125) currently reports to **Dummy**, not to a real Management user. Before Step 1 executes, confirm whether:
- (a) Jaspal should route to Gaurav Budhia → update `profiles.reporting_manager_id` for Jaspal to Gaurav first, then run backfill; **or**
- (b) "Dummy" is the intended terminal reviewer (test account) → leave as-is.

### Step 3 — Access verification (no code change expected)
Sign in as Gaurav Budhia and open **Annual Reviews (Team)**:
- Scope filter shows **Management** chip with the correct badge count.
- Status filter includes **Management Review Pending**.
- Row click opens the instance in edit mode (not read-only), Management approval action visible.

If any of those three UI checks fails, drop into build mode to patch:
- `resolveMyRole()` in `TeamAnnualReview.tsx` (management precedence)
- `annual_review_directory_access` / instance-level RLS for the `management` role
- `TeamReviewDetailContent.tsx` edit-mode gate for `management` stage

(No file edits are planned up-front — Step 3 is a check, and code is already in place per ADR-149.)

### Step 4 — Guardrail (small, additive) to prevent recurrence
Add a lightweight scheduled check / admin dashboard tile: **"BU-Head instances missing Management routing"** = count of rows where `overall_status IN ('pending_bu','pending_management','completed')` AND employee's `reporting_manager` has role `management` AND (`management_id IS NULL` OR `NOT enabled_stages ? 'management'`). Zero-touch surfacing so this can never silently drift again.

---

# Risk & Impact

- **Data impact:** Step 1 mutates up to 11 in-flight rows plus any completed BU-Head rows under Gaurav/Dummy. Every mutation is snapshotted to `annual_review_reset_archive` and logged to `annual_review_access_audit` → fully reversible.
- **Workflow impact:** Reopens completed instances to `pending_management`. Employees will see status revert; acceptable per ADR-138 intent (Management is the true terminal).
- **UI/UX impact:** None from Step 1. Step 3 is verification only.
- **Regression risk:** Low — RPC is idempotent (skips rows already stamped) and constraint/validator fixes are already live.
- **Rollback:** `annual_review_reset_archive` holds the pre-image; a targeted revert RPC can restore prior status/stages if needed.
- **Scalability:** Bounded to ~15 rows today; RPC is O(n) over Management users' direct reports.

# Success criteria
- 0 rows with `overall_status='pending_management' AND management_id IS NULL`.
- Gaurav Budhia sees all his direct-report BU Heads in the Management queue and can submit scores.
- Jaspal's instance shows a **Management Review Pending** stage routed to the intended reviewer, not skipped.

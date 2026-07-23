
# Annual Review — Dept Head data invisible to BU Head (Employee 200564, Javed Jafri)

## 1. Facts observed (verified pre-plan)

Instance `806d6da6-d7c4-41cc-a048-d8a11092c8da`:
- `overall_status = pending_bu`, `enabled_stages = [self, dept_head, bu_head]`
- `dept_head_id = 6088431e…` (**Y R V S Murthy**, emp 200493)
- `bu_head_id = e0bc3607…` (**Anil Kumar Pathak**, emp 200301)
- `updated_at = 2026-07-23 10:25:11`

`annual_review_responses` rows for the instance (only 2):
- `self` — Javed Jafri — locked, 5 scores, submitted 2026-07-16.
- `dept_head` — **Shrikant Ganguly** (`a3db1d69…`) — **is_locked=false, 0 scores, submitted_at=NULL**, updated 2026-07-23 08:08:56.

Audit trail on this instance:
- 2026-07-13: head remap set dept_head → Shrikant, bu_head → Anil (POLICY §AR-HEAD-MASTER-AUTHORITATIVE).
- 2026-07-21 09:31 & 2026-07-23 07:42 / 08:08: three send-backs `bu_head → dept_head` (last one is the "reason: null" system send-back).
- Instance later flipped to `pending_bu` at 10:25:11 with **no new/locked dept_head response row** and with `dept_head_id` now pointing at **Y R V S Murthy** (different from the response's reviewer_id).

## 2. Root cause (5-Why)

1. Why does BU Head see nothing from Dept Head?
   The only `dept_head` response row belongs to Shrikant and is `is_locked=false` with an empty `criteria_scores` object → the reviewer UI treats it as "no submission".
2. Why is that row Shrikant's, when the current dept_head is Y R V S Murthy?
   `dept_head_id` was reassigned after the response row already existed. `annual_review_responses` is keyed by `(instance_id, reviewer_id, reviewer_role)` (reviewer_id, not role-slot), so the previous reviewer's draft was left orphaned and no new row was created for the new reviewer.
3. Why did status advance to `pending_bu` without a locked dept_head response?
   `advance_annual_review_status` promotes the instance based on `overall_status` progression alone; after the 08:08 send-back plus a subsequent proxy/manual advance, it did **not** enforce the invariant "an `is_locked=true` response must exist for the currently-assigned reviewer of the outgoing stage".
4. Why is that invariant missing?
   Historical assumption: reviewers never change mid-flow. Multiple ADRs (head-remap, cascade-triggers, reviewer-resync) now mutate `*_id` slots freely, but the advance/send-back RPCs still read/write responses by `reviewer_id`, not by `(instance_id, reviewer_role)`.
5. Why did no test catch it?
   No regression exists for "reviewer reassigned after a submission draft". Send-back + reassign + re-advance was never covered.

Companion issue: the "Dept Head Review Pending" screen the reviewer used never persisted scores because the front-end fetched the row by the *new* `dept_head_id` (Y R V S Murthy) → no row found → new draft on his id was written locally but the finalize call routed through a path that resolves by role and updated Shrikant's stale row instead. Net effect: BU Head sees an empty dept_head response.

## 3. CAPA

### Corrective (this instance + all similar)
- Detect every open instance where the currently-assigned reviewer for a completed stage has **no locked response row** while a *different* user does. Repair by:
  - Rebinding the latest non-empty response for that role to the current `*_id` (only when the orphan row has scores), OR
  - When the orphan row is empty (Javed's case): delete the empty orphan, roll `overall_status` back one stage, and notify the current reviewer to re-submit.
- For 200564 specifically: delete the empty Shrikant dept_head draft, set `overall_status = pending_dept`, and notify Y R V S Murthy.

### Preventive (code + schema)
1. **Role-keyed response contract (ADR-142)**: change `annual_review_responses` unique key to `(instance_id, reviewer_role)`; keep `reviewer_id` as an attribute that must equal the instance's current `*_id` for that role at write-time. Migrate existing dupes by picking the most recent locked row per role.
2. **`advance_annual_review_status` invariant**: before promoting off any non-terminal stage, require a row with `reviewer_role = <that stage>`, `reviewer_id = <instance.*_id for that stage>`, `is_locked = true`, and non-empty `criteria_scores`. Otherwise raise `AR_ADVANCE_MISSING_ROLE_RESPONSE`.
3. **`send_back_annual_review_status`**: when unlocking a stage, always clear/refresh `reviewer_id` on the affected response row to match the instance's current `*_id` for that role (so a reassignment between send-back and re-submit doesn't strand the draft).
4. **Reviewer-reassignment trigger**: when `dept_head_id`/`bu_head_id`/`management_id` changes, rebind the open unlocked response row for that role to the new reviewer (or delete it if empty) in the same transaction. Log to `annual_review_reviewer_resync_audit`.
5. **Front-end resolver**: `useAnnualReviewInstanceResponses` and `HrFinalizationSheet` fetch by `(instance_id, reviewer_role)` — never by reviewer_id — and display the role's latest response.
6. **Policy**: add **POLICY §AR-RESPONSE-ROLE-CANONICAL** — one row per `(instance, role)`; reviewer changes must rebind, not orphan.
7. **Regression tests**: `sendBackThenReassignReviewer.test.ts`, `advanceBlocksOnMissingRoleResponse.test.ts`, `roleCanonicalUniqueness.test.ts`, plus a data-repair dry-run test.

## 4. Rollback & risk

- Migration is additive + one dedup pass; backup taken via `create-backup` before running.
- Rollback: keep the old `(instance, reviewer, role)` unique index dropped only after 72h of clean logs; new invariant can be disabled via `app_settings.ar_enforce_role_response = false` if a mass-repair is needed.
- Impact: `~130` open instances scanned; only those with orphaned-role responses touched. All CLU/ADR-125/126/127 data preserved.

## 5. Deliverables order

1. Read-only diagnostic SQL for all affected instances (report only).
2. Migration: rebind trigger + new response uniqueness + guarded advance RPC + send-back rebind.
3. Data repair migration (per-instance, audited to `annual_review_final_backfill_audit_2026_07`).
4. Front-end resolver switch to role-keyed fetch.
5. Vitest regressions.
6. DOCUMENTATION.md + POLICY.md updates (ADR-142, §AR-RESPONSE-ROLE-CANONICAL).

## 6. UI change

Only in the "Dept Head review" panel of `HrFinalizationSheet` and BU Head read-view: the section now sources by role, so a stale draft from a previous reviewer is no longer displayed. A one-line yellow notice appears when the current reviewer has not yet submitted after a reassignment: "Dept Head was reassigned — awaiting fresh submission from {name}." No other visual changes.

## 7. Open decision

For the ~N orphaned-but-scored dept_head rows across the cycle:
- **A**: Auto-rebind the orphan to the new reviewer (scores carry forward, new reviewer can edit before lock).
- **B**: Discard and force re-submission (safer; new reviewer starts clean).
- **C**: Rebind + require the new reviewer to explicitly "Confirm inherited scores" before advance.

Please pick A / B / C before I run the data repair.

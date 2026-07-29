## What the error means

The toast `stage dept_head is not enabled for this instance` comes from
`advance_annual_review_status()` — it refuses to submit a stage that is not
present in `annual_review_instances.enabled_stages`.

## Confirmed current state (verified by query)

Exactly **4** instances in the whole cycle are in this dead-end — their
`overall_status` points at a stage that their own `enabled_stages` no longer
contains. All four are the same shape:

| Emp code | Name | overall_status | enabled_stages | dept_head_id | bu_head_id |
|---|---|---|---|---|---|
| 101851 | Rupesh Kumar Sharma | pending_dept | `[self, bu_head]` | 102050 | 102050 |
| 101769 | Prince Prakash | pending_dept | `[self, bu_head]` | 102050 | 102050 |
| 101149 | Preeti Jain | pending_dept | `[self, bu_head]` | 102050 | 102050 |
| 100010 | Ashok Kumar Mahto | pending_dept | `[self, bu_head]` | 102050 | 102050 |

`dept_head_id` and `bu_head_id` are the **same person** — Amit Kumar Sharma
(102050, active). He is the one hitting the error: the UI routes him to the
Dept Head form because `overall_status = 'pending_dept'`, but the RPC rejects
the submit because `dept_head` was removed from `enabled_stages`.
100010 already has an unlocked `dept_head` response row with 10 criteria
scored; the other three have only the locked `self` row.

All four were last touched at the same instant (`2026-07-27 04:55:51`), i.e. a
single bulk stage-contraction (dept/BU dedup family, ADR-198/§AR-BU-HEAD-TERMINAL
lineage) removed `dept_head` from `enabled_stages` **without re-anchoring
`overall_status`** — violating POLICY §AR-STAGE-REVERT-NO-DEAD-END. I have not
yet pinned the exact mutator; step 1 confirms it from the audit log before any
guard is written.

No other status/enabled_stages mismatch exists anywhere else in the table.

## Risk & impact

- **Data**: touches only these 4 rows plus one response row (role rename). No schema drop; additive trigger only.
- **Workflow**: 100010's already-entered Dept Head scores are preserved by re-labelling the row to `bu_head` (same reviewer, so no ownership change and ADR-142 rebind stays satisfied).
- **Regression risk**: the new invariant trigger could reject legitimate stage edits made by `annual_review_edit_workflow` / `set_annual_review_enabled_stages`; mitigated by having those RPCs re-anchor first and by writing the trigger as a re-anchor (self-heal) rather than a hard raise.
- **Rollback**: snapshot table `annual_review_dept_deadend_repair_2026_07` holds pre-change rows; `DROP TRIGGER` reverts the guard.

## Plan

1. **Confirm the mutator** — read `system_audit_logs` around `2026-07-27 04:55:51` for these instance ids to identify which RPC/trigger stripped `dept_head`.
2. **Snapshot** the 4 instances and their responses into `annual_review_dept_deadend_repair_2026_07` (id, overall_status, enabled_stages, reason).
3. **Repair data (migration)**
   - For 100010: `UPDATE annual_review_responses SET reviewer_role='bu_head' WHERE instance_id=… AND reviewer_role='dept_head'` (reviewer_id is already 102050 = bu_head_id), only if no `bu_head` row exists.
   - For all 4: `overall_status := 'pending_bu'` (first enabled pending stage per `annual_review_first_pending_status`), `updated_at = now()`.
   - Audit-log each as `annual_review.deadend_reanchor` with previous status, new status and reason.
4. **Prevent recurrence (invariant)** — add `tg_ar_status_within_enabled_stages` (BEFORE UPDATE on `annual_review_instances`): when `overall_status` is a `pending_*` value whose role is not in `enabled_stages`, re-anchor it to the first enabled pending stage via the existing `annual_review_first_pending_status` helper (and log to `system_audit_logs`) instead of leaving a dead end. Raise only if no enabled stage can host the review.
5. **Close the loop in the stage-contraction path** — make the dept/BU-terminal contraction routine call the same re-anchor helper explicitly, so the trigger is a safety net rather than the mechanism.
6. **Tests** — extend `src/lib/annualReview/stageChain.ts` coverage with a case asserting that a status whose role is disabled resolves to the first enabled pending stage; add a SQL-contract test/mock covering the trigger's re-anchor and the raise-on-no-stage path.
7. **Docs** — new `docs/adr/ADR-200.md` (dead-end re-anchor invariant), POLICY §AR-STAGE-REVERT-NO-DEAD-END extended to cover `enabled_stages` contraction, DOCUMENTATION.md version bump, and a `mem://` memory note.

## Verification

- Re-run the mismatch query: expect **0** rows with `overall_status` outside `enabled_stages`.
- Confirm the four instances read `pending_bu` with Amit Kumar Sharma (102050) as the active BU Head reviewer, and that 100010's 10 criteria scores are intact under `bu_head`.
- Ask 102050 to submit one of them (or simulate via the RPC) and confirm no error.

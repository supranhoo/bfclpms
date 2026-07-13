## Refined plan — self-head short-circuits + strict re-mapping

### Rules (locked)
1. **Employee IS the configured BU head of their own BU** → chain terminates at self. `enabled_stages = ['self','manager','skip_manager']` (or existing enabled subset minus dept/bu/hr), `bu_head_id = NULL`, `dept_head_id = NULL`. Once skip approves, `overall_status → completed`.
2. **Employee IS the configured Department head of their own department** → skip the dept-head stage. `dept_head_id = NULL`, `enabled_stages` drops `'dept_head'`. Chain becomes self → manager → skip → BU head → HR.
3. **Everyone else** → `dept_head_id = departments.head_user_id`, `bu_head_id = business_units.head_user_id`. No manager-as-fallback for the dept-head or BU-head stage; if the configured slot is empty, the stage is skipped (not filled by the manager).
4. **Fallback for manager / skip** stays as-is (working correctly).

### What "wrong reviewer" means now
Any instance where `dept_head_id` or `bu_head_id` is a person other than the currently-configured head (typically the direct manager who was stamped as a fallback at seed time) is wrong and must be re-mapped. That was the visible symptom in the earlier employee case — the review card was showing the manager instead of the actual dept/BU head.

### Execution steps

**Step 1 — Audit snapshot.** For every affected instance write `(id, old_dept_head_id, old_bu_head_id, old_enabled_stages, old_overall_status, reason, corrected_by, corrected_at)` into `annual_review_rescore_audit_2026_07`. Reversible.

**Step 2 — Classify each of the 56 past-dept instances into one of:**
- `self_is_bu_head` → apply Rule 1
- `self_is_dept_head` → apply Rule 2
- `dept_head_changed` → rewrite `dept_head_id` to current configured head
- `bu_head_changed` → rewrite `bu_head_id` to current configured head
- `already_correct` → no-op

**Step 3 — Rewrite columns per classification.** `manager_id`, `skip_id`, `hr_id` untouched. `enabled_stages` recomputed from the rules above.

**Step 4 — Step-back policy (preserves completed & pending correctly).**
- If dept stage was already approved by the WRONG person (was the manager or an outdated head) → reset `overall_status = 'pending_dept'` and clear `annual_review_responses.dept_head_*` for that instance. New (correct) dept head must approve.
- If dept stage was correct and only BU was wrong → keep dept approval, rewrite `bu_head_id`, status stays `pending_bu`.
- If Rule 1 (self-is-BU-head) applies and skip already approved → status becomes `completed` immediately (no BU/HR stage exists).
- If Rule 2 (self-is-dept-head) applies and manager/skip already approved → status advances to `pending_bu` (dept stage removed from `enabled_stages`).
- `completed` instances are re-opened ONLY if the dept-head approval on them was by the wrong person; otherwise left alone (view-approval stays as-is per your earlier ask).

**Step 5 — Cascade trigger to prevent recurrence.**
`BEFORE UPDATE` trigger on `departments.head_user_id` and `business_units.head_user_id`. When changed:
- Rewrite `dept_head_id` / `bu_head_id` on all active-cycle instances whose status is ≤ the stage in question (dept change → status in `pending_self/manager/skip/dept`; BU change → status in those + `pending_bu`).
- Re-evaluate self-is-head rules for the affected employees and update `enabled_stages` accordingly.
- Post-approval instances are NOT rewritten silently — HR must run explicit re-mapping.
- Every change written to `system_audit_logs` as `org_heads.dept_head_cascaded` / `org_heads.bu_head_cascaded`.

**Step 6 — Tests + docs**
- `hierarchyGuard.test.ts` — add cases: self-is-BU-head, self-is-dept-head, dept head empty (stage skipped, no manager fallback).
- New `orgHeadCascadeTrigger.test.sql` — insert instance, change `departments.head_user_id`, assert pre-approval row is rewritten and post-approval row is preserved.
- `resyncDeptHead.test.ts` — verify manager-as-fallback rows are corrected and no new manager fallbacks are ever produced.
- `POLICY.md` §AR-HEAD-MASTER-AUTHORITATIVE — rewrite: (a) manager is never a fallback for dept/BU stage, (b) self-is-head short-circuits the chain, (c) org master edits cascade pre-approval only.
- `DOCUMENTATION.md` v-bump + changelog listing the 26 corrected instances and the 3 Org-Settings self-head fixes.

### Two confirmation points before I switch to build

1. **Rule 1 wording** — when employee IS the BU head, do you want the chain to end after `skip_manager` (self → mgr → skip → done, HR stage also removed)? Or should HR still finalize? Your message says "process ends there and then only", which I'm reading as HR-stage also removed. Confirm.
2. **Completed instances with wrong dept head** — reopen them to `pending_dept` (strict), or leave them closed with an audit-only note (pragmatic)? Earlier you said "preserve completed"; the strict interpretation of the new policy would reopen. I'll default to **leave completed as-is + audit note** unless you say otherwise.

## Risk & Impact
- **Data**: ≤ 26 instance rows rewritten, ≤ 22 responses cleared, 26 audit rows, 3 Org-Settings self-head rows flagged for HR to fix, 2 new triggers.
- **Workflow**: up to 22 employees regress from `pending_bu` → `pending_dept`; a handful may jump to `completed` if Rule 1 applies with skip already approved.
- **UI**: reviewer name on the review card will now always match Organization Settings; no component changes needed beyond that.
- **Regression risk**: low — trigger scoped to pre-approval, self-head short-circuit is idempotent, full audit for rollback.

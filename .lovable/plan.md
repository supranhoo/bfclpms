
# Fix: Reviews auto-completing when Dept/BU Head is inactive

## 1. Root cause (verified against DB)

`annual_review_effective_chain_details` currently marks a stage as **`skipped`** with reason `reviewer_inactive` when the assigned reviewer's `profiles.is_active = false`. `annual_review_next_status` then computes the "next" stage from the shortened chain, and `advance_annual_review_status` obediently transitions the instance — including, per ADR-124, all the way to `completed` with a full auto-computed `total_score` / `final_rating`.

Concrete evidence (`system_audit_logs.annual_review.stage_auto_skipped`, all 4 cases):
```
enabled:  [self, dept_head, bu_head]
effective:[self]
skipped:  [{stage:bu_head, reason:reviewer_inactive},
           {stage:dept_head, reason:reviewer_inactive}]
resolved_to: completed
```

The same inactive user was mapped to BOTH `dept_head_id` and `bu_head_id`, so once they were deactivated the entire downstream chain collapsed. Self submitted → jumped straight to `completed` with only the employee's own weighted score contributing to the final.

### 5-Whys
1. Review shows completed → `advance_annual_review_status` set `overall_status='completed'` after Self.
2. Why after Self? → Effective chain collapsed to `[self]`, so `next_status` returned `completed`.
3. Why did the chain collapse? → Both Dept Head and BU Head were skipped by the resolver.
4. Why were they skipped? → Reviewer profile `is_active=false` → resolver emits `reviewer_inactive` skip.
5. Why does an inactive reviewer silently disappear from a governance chain? → Resolver treats `inactive` the same as `no_reviewer_mapped` / `duplicate_reviewer`, but inactivity should require **admin remap**, not silent completion.

### Confirmed blast radius
- **4 instances real-bug completed** with no dept/BU review (Prince Prakash 101769, Rupesh Kumar Sharma 101851, Preeti Jain 101149, Sumit Kumar 100563).
- 39 other completed-without-dept instances are **legit** — same person was both Dept & BU, and the BU stage was properly locked; those stay untouched.

## 2. Risk & Impact

- **Data**: 4 rows to repair. All have `finalized_at`, `total_score`, `final_rating` populated purely from Self — must be nulled so real reviewers can score. Self responses stay locked (Self did submit).
- **Workflow**: Prevents future silent completions when reviewers are deactivated; forces admin remap. No effect on the healthy 800 completed rows.
- **UI/UX**: None (server-only change + data repair).
- **Regression**: Low — the change tightens skip semantics. Existing `no_reviewer_mapped`, `self_assignment`, and `duplicate_reviewer` paths remain identical.
- **Rollback**: Full audit rows written per repair; trigger and function changes are additive (previous definitions kept in migration comment).

## 3. Plan

### Step A — Server: harden the resolver
`annual_review_effective_chain_details`: keep the `reviewer_inactive` diagnosis, but **do not mark the stage `skipped`**. Instead, keep the stage in the effective chain so the workflow blocks on it until an admin remaps the reviewer.

Verification: query the 4 instances after the change — effective chain must again include `dept_head`/`bu_head`; `advance_annual_review_status` from Self returns `pending_dept` (not `completed`).

### Step B — Server: completion invariant
Add a `BEFORE UPDATE OF overall_status` trigger on `annual_review_instances` that blocks a transition to `completed` when the terminal stage in `enabled_stages` has no locked response in `annual_review_responses`. Belt-and-suspenders against any future path that tries to fast-forward past a real reviewer.

Verification: attempt an admin UPDATE that sets `overall_status='completed'` on a `pending_dept` row → trigger raises.

### Step C — Repair the 4 instances
Single migration:
- Reset `overall_status` → `pending_dept` (Dept is the first pending stage per `enabled_stages` order).
- NULL `finalized_at`, `finalized_by`, `total_score`, `final_rating`, `criteria_weighted_score`.
- Leave `system_scores`, `system_scores_raw`, and the locked Self response untouched.
- Write an `annual_review.auto_complete_reversal` audit row per instance.

Verification: `SELECT overall_status, finalized_at, total_score FROM annual_review_instances WHERE id IN (...)` returns `pending_dept / NULL / NULL`. Simulate `advance_annual_review_status` for Dept — must not complete unless a real Dept response is locked.

### Step D — Notify admins to remap
Note in the audit metadata which reviewer_id is inactive so HR/Admin can update the Employee Master hierarchy for the affected 4 (or replace the deactivated user directly on the instance). No code path is needed for this — surface in the existing admin console using the audit-log-driven "reviewer inactive" listing (already visible via the Comprehensive Report queue).

### Step E — Documentation
- **ADR-127b — Inactive reviewers block, never skip.** New ADR documenting the tightened resolver semantics.
- **POLICY.md § AR-INACTIVE-REVIEWER-BLOCK** (new): "A stage whose assigned reviewer is `is_active=false` remains in the effective chain and blocks advancement until an admin remaps the reviewer. Inactivity is NOT a skip reason."
- **DOCUMENTATION.md** entry: v2.66.120.

## 4. UI changes
**Not Applicable** — this is a server-side governance fix and a targeted 4-row repair. No visual changes on any page.

## 5. Tests
- Unit (Vitest): none — logic is in PL/pgSQL.
- Add a plpgsql regression via a dedicated migration comment sanity check that runs the resolver on a synthesized fixture and asserts `reviewer_inactive` is present but `skipped=false`.
- Manual verification queries listed inline per step.

## 6. What I need from you
Approve the plan and I'll ship the migration (Steps A + B + C) and the doc updates in one build turn. The 4 repaired reviews will re-appear in the Dept Heads' queues immediately; you'll want to instruct HR to remap the inactive reviewer (`1a92c542-…` for Preeti/Rupesh/Prince; `dfaf1ab8-…` for Sumit) so their Dept/BU stages can proceed.

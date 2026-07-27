
## 1. Assumptions

- "Final approval removed" = the reviews lost their Completed state after an admin removed the BU Head stage today.
- Target end state = each of the 10 instances shows **Completed** with a recomputed final score/rating, derived from the Dept Head (now terminal) stage.

## 2. What actually happened (verified, not assumed)

All 10 instances are in the same state right now:

- `overall_status = pending_dept`, `enabled_stages = ["self","dept_head"]`, `bu_head_id = NULL`
- `total_score`, `criteria_weighted_score`, `final_rating`, `finalized_at` = **NULL**
- Yet the `dept_head` response **exists, is locked and was submitted** (13–20 July)

Audit trail (`annual_review_access_audit`, 27 Jul 16:17–16:25, actor same admin, reason "Update Based on instruction"):

```text
workflow_edited_post_action
  mode: supersede
  removed: ["bu_head"]
  prev_stages: [self, dept_head, bu_head]  ->  new_stages: [self, dept_head]
  prior_status: pending_bu                 ->  new_status: pending_dept
```

Earlier context: BU Head was Dinesh Chandra Chaudhary (101969), now **inactive**; the ADR-173 succession sweep at 04:55 today repointed them to 102050 and left them at `pending_bu`. The admin then removed the BU stage entirely.

### 5-Why

1. Why are they not Completed? Status was set to `pending_dept` and scores were nulled.
2. Why? The supersede branch of `set_annual_review_enabled_stages(uuid, jsonb, text, text)` always rewinds.
3. Why does it rewind to Dept? It picks `LIMIT 1` of the first non-`self` enabled stage — no ordering, no check for existing responses.
4. Why does that matter? Dept Head had already submitted and locked; removing a *downstream* stage should promote the review to terminal, not rewind to an already-completed one.
5. Why wasn't it caught? Supersede was designed for reviewer swaps / removing *actioned* stages; the "remove the only remaining downstream stage" case has no test.

**Root cause:** supersede status resolution ignores which enabled stages already have locked responses, and unconditionally clears `total_score` / `final_rating` / `finalized_at`.

## 3. Risk & impact

- **Data:** repair writes to 10 rows only (status + recomputed aggregates). Code fix changes one SQL function; no schema change.
- **Workflow:** after the fix, removing a downstream stage on an already-actioned chain resolves to `completed` instead of a false pending.
- **Regression risk:** medium-low — the change only narrows *where* supersede lands; reviewer-swap and stage-removal-of-actioned-stage paths keep current behaviour (still rewind to the earliest affected stage).
- **UI:** no visual change; grid simply shows Completed + score instead of "Dept Head pending / —".
- **Rollback:** re-deploy the previous function body; per-row before/after captured in a repair audit table.

## 4. Recomputed scores (dry run, `annual_review_compute_final_summary`)

| Code | Name | Criteria wt | Final | Rating |
|---|---|---|---|---|
| 100759 | Dheeraj Kumar Patro | 325 | 84 | Good |
| 101200 | Rohit Kumar Deep | 325 | 84 | Good |
| 101961 | Vaibhav Trivedi | 325 | 84 | Good |
| 101997 | Puja Kumari | 325 | 82 | Good |
| 102009 | Manoranjan Kumar Barik | 325 | 81 | Good |
| 102008 | Sujal Haldar | 325 | 80 | Good |
| 200449 | Abhishek Raj | 75 | 31 | Poor |
| 100890 | Firdoush Alam | 0 | 0 | Poor |
| 101942 | Amol Ashok Shivankar | 0 | 0 | Poor |
| 101959 | Lekh Raj | 0 | 0 | Poor |

The last three have **empty criteria scores in both the self and dept-head responses** — they were submitted narrative-only. Finalising them would stamp a genuine 0 / "Poor".

**Recommendation:** finalise the 7 scored ones now; for 100890, 101942, 101959 send the Dept Head stage back for scoring instead of stamping 0. (Say the word if you want all 10 finalised as-is.)

## 5. Plan

**Step 1 — Repair (data)**
- Create `annual_review_bu_removal_repair_2026_07` audit table (instance, employee, before status/stages/scores, after, reason).
- For the 7 scored instances: recompute via `annual_review_compute_final_summary`, write `total_score`, `criteria_weighted_score`, `final_rating`, `finalized_at = now()`, `finalized_by = NULL` (system), `overall_status = 'completed'`; log a `system_audit_logs` row `annual_review.bu_removal_repair_finalized`.
- Verification: re-query the 10 rows and confirm status/score; confirm the 3 unscored ones remain `pending_dept` with the Dept Head able to act.

**Step 2 — Fix the RPC (prevent recurrence)**
- In `set_annual_review_enabled_stages(uuid, jsonb, text, text)` supersede branch:
  - resolve the new status as the **first enabled stage, in canonical order, that has no locked non-archived response** (archived responses from removed stages don't count);
  - if every enabled stage is already actioned → set `completed` and recompute the aggregates via `annual_review_compute_final_summary` instead of nulling them;
  - only null `total_score` / `final_rating` / `finalized_at` when the resolved status is actually a `pending_*`.
- Keep the existing archive-on-removal behaviour untouched.

**Step 3 — Tests**
- Extend `src/test/workflowEditImpact.test.ts` / add `src/test/annualReview/supersedeTerminalPromotion.test.ts`: removing the only remaining downstream stage on an actioned chain → `completed`, not a rewind; removing an *actioned* stage still rewinds; reviewer swap still rewinds.
- Assert in the migration-shape test that the supersede branch no longer contains an unconditional `total_score = NULL`.

**Step 4 — Documentation**
- `docs/adr/ADR-183.md` — supersede must promote to terminal when all enabled stages are actioned.
- `POLICY.md` §AR-SUPERSEDE-NO-FALSE-REWIND; `DOCUMENTATION.md` version history.
- Memory note under `mem/features/annual-review/`.

## 6. UI changes

None. Admin → Progress and the Team queue will simply reflect Completed + score for the repaired rows.

## 7. Answer to "can this be implemented?"

Yes — the Dept Head responses are intact and locked, so the completion can be restored without asking any reviewer to re-enter data (except the three narrative-only cases noted above).

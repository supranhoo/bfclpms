## Problem

In the Admin Progress grid, several employees show `Dept /5 = 0.0` even though the department head never actually scored them. The zero then propagates into blended/final scores for reviews that have since completed.

## Verified current state

| Fact | Evidence |
|---|---|
| No server guard on empty stage submissions | `advance_annual_review_status` computes `v_stage_scores` (count of scored criteria keys) but the variable is never referenced again — dead code |
| 30 stage responses are locked + submitted with `criteria_scores = {}` while the same instance's self response has 10 scored criteria | DB query across all instances |
| Affected roles | 24 `dept_head`, 3 `bu_head`, plus a few mixed; 6 instances already `completed` |
| Concrete example | 100757 Kanhaiya Kumar Singh — dept_head response by Firoz Ahmad, submitted 2026-07-15 11:13:44, `criteria_scores = {}`, only `__overall_recommendation` narrative present, `weighted_score = 0.00` |
| Grid display | `0.0` comes from a real `weighted_score = 0.00` row; stages with no response render `—`. Display is faithful — data is wrong |
| Not a narrative-only template case | The templates involved carry scoreable criteria (self side scored 10 of them), so ADR-170's narrative-only exemption does not apply |

**Unconfirmed:** the exact client path that allowed submitting with zero criteria (reviewer form vs. proxy/assisted path). Step 1 of the plan is to confirm this before touching UI validation.

## Plan

**1. Confirm the client entry point (investigation, no code)**
Correlate the 30 responses against `annual_review_proxy_submissions` and the reviewer-form submit path to determine whether these came from the normal reviewer form, the assisted/proxy path, or a bulk action. Fix validation at whichever path is leaking.

**2. Server-side invariant (primary fix) — new policy §AR-STAGE-SCORE-REQUIRED**
Migration replacing `advance_annual_review_status`:
- Reuse the already-computed `v_stage_scores`. For any non-`self` role, if the resolved template exposes ≥1 scoreable criterion for that role and `v_stage_scores = 0`, raise a `check_violation` with a clear reviewer-facing message.
- Reuse the existing narrative-only helper semantics (ADR-170 / `templateSelfCriteria.ts`) so genuinely narrative-only templates still advance.
- Guard is additive and non-destructive; rollback = re-apply the prior function body.

**3. Repair the 30 affected instances**
- **Not yet completed (24):** delete/unlock the empty stage response, preserving the `__overall_recommendation` narrative, and rewind `overall_status` back to that stage so the real reviewer can score. Never leave a dead-end chain (§AR-STAGE-REVERT-NO-DEAD-END).
- **Already completed (6):** rewind to the offending stage, clear `total_score` / `final_rating` / `criteria_weighted_score` so they recompute, and notify the reviewer. These are listed individually before execution for your sign-off.
- Every row written to an audit table with the before/after snapshot.

**4. Display safety net**
In the Progress grid and comprehensive report, render a stage cell as `—` with a "submitted without scores" warning marker when the response is locked but has zero criteria scores, instead of a misleading `0.0`. This prevents any future data gap from silently reading as a legitimate zero.

**5. Regression protection**
- PL/pgSQL-level test fixtures asserting: scoreable template + empty stage scores → exception; narrative-only template + empty scores → advances.
- Vitest coverage for the new grid cell rendering (scored 0 vs. not scored).
- A standing detector query so this class of gap surfaces in monitoring rather than via a screenshot.

**6. Documentation**
`ADR-172`, `POLICY.md` §AR-STAGE-SCORE-REQUIRED, `DOCUMENTATION.md` version history, and a project memory entry.

## Risk & impact

- **Data:** No schema change. Step 3 rewinds 30 instances — 6 completed ones lose their (invalid) final score until re-reviewed. Full audit snapshot taken first.
- **Workflow:** Reviewers on those 30 reviews get the item back in their queue.
- **Regression:** Main risk is the guard falsely blocking legitimate narrative-only templates — mitigated by reusing the existing ADR-170 helper and by the paired test.
- **Scalability:** Guard adds one already-computed check per advance; no new queries.

## Confirmation needed

For the 6 already-`completed` reviews, do you want them rewound (correct scores, reviewer must redo the stage) or left as-is with a flag? I'll default to rewinding unless you say otherwise.

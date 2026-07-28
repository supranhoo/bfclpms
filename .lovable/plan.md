## What the data actually shows (verified this turn)

Employee 101279 — Dipak Kumar Chandara, instance `360ebf91…`:

- Chain is `self → dept_head → bu_head`; current status **`pending_dept`**.
- The `dept_head` response row exists, is **unlocked, never submitted**, `criteria_scores = {}`, but `qualitative_responses.__overall_recommendation` holds the full written recommendation.
- Its effective template has **10 criteria explicitly assigned to the `dept_head` stage** — so this stage *is* a scoring stage, not narrative-only.
- The row was last touched at `2026-07-27 04:15:08` — the exact timestamp of a bulk repair batch.

Scope across the cycle:

- `annual_review_empty_stage_repair_2026_07` (the ADR-172 "empty stage" sweep) ran at `2026-07-27 04:15:08` and repaired **30 instances**, unlocking their `dept_head`/`bu_head` responses, preserving the qualitative text, and rewinding status (`completed` or `pending_bu` → `pending_dept` / `pending_bu`).
- Today there are **93** `dept_head` responses with empty `criteria_scores`; **54** of those also carry a written recommendation — split as 28 `completed`, 25 `pending_dept`, 1 `excluded`.
- Of those 54, **25 completed ones sit on templates where the dept-head stage has 0 scoreable criteria** (legitimately narrative-only — blank is correct there), while **~26 sit on templates with 10–14 scoreable dept-head criteria** (the real defect class, 101279 among them).

So there are two distinct problems wearing the same symptom, and they need different fixes.

## Root cause (one confirmed, one to confirm)

**Confirmed — display/status:** For 101279 and peers, the review really is *not* complete in data terms: the stage has zero criteria scores and was rewound to `pending_dept` by the 27 July sweep. The UI is faithfully rendering "blank / pending". The reviewer's perception of completeness comes from the recommendation text, which survived.

**Unconfirmed — how a scoring stage got locked with `{}` scores in the first place.** These rows were submitted before the sweep with no criteria at all. Candidate causes, in order of likelihood: a submit path that bypassed the score requirement (proxy/assisted submit or a bulk stage-advance RPC), or the draft-persistence race where the recommendation textarea saved while the criteria map was not yet flushed. Step 1 below pins this down before any code change — I will not guess it.

Note the legacy note in `04-erd-annual-review.md` still describes the column as `status`; the real column is `overall_status`. Worth correcting while here.

## 5 Whys

1. Why is the dept-head data blank? Because `criteria_scores` for the `dept_head` response is `{}`.
2. Why is the instance pending again? The 27 July empty-stage sweep detected the empty scoring stage and rewound it.
3. Why was the stage empty despite being locked/submitted? A submit path recorded the stage without criteria — to be identified in Step 1.
4. Why did that go unnoticed? Only the sweep detects it; nothing surfaces "reviewed but unscored" to the reviewer or to HR at submit time.
5. Why does the reviewer believe it is done? The recommendation persisted and is visible, so the form looks answered.

## Plan

**Step 1 — Pin the write path (read-only).**
Correlate the 26 defective responses against proxy-submission rows, bulk stage-advance audit rows and `annual_review_access_audit` to identify which RPC created them. Deliverable: named RPC/UI path. Verification: every defective response maps to one identified path, or the residue is explicitly listed.

**Step 2 — Classify and publish the two cohorts.**
A read-only diagnostic RPC `annual_review_unscored_stage_diagnostic(cycle_id)` returning, per instance: employee code, stage, scoreable-criteria count, has-recommendation, locked, status, sweep-touched. Verification: totals reconcile with the counts above (54 = 26 defect + 25 narrative-only + variance).

**Step 3 — Fix the display for the narrative-only cohort (UI only).**
Where the stage genuinely has 0 scoreable criteria, the grid and detail view must render `Reviewed — narrative only` instead of a blank cell or `0.0`. This is the same class of fix as ADR-179 for KRA-derived rows and goes in the existing `kraStageDisplay` SSOT rather than a new one. Verification: 25 completed instances show the new label; scored rows are unchanged.

**Step 4 — Recovery for the 26 defective ones.**
Scores were never captured, so they cannot be reconstructed — they must be re-entered by the department head. The recommendation text is intact and stays on the form. Deliverable: an HR-visible "Reviewed but unscored" queue (reusing the Orphaned Reviews tab pattern) plus a one-time notification to the affected department heads. No silent auto-scoring, and nothing gets force-completed.

**Step 5 — Prevent recurrence.**
Extend the `trg_ar_stage_score_required` guard so a lock/submit on a stage with scoreable criteria > 0 and `criteria_scores = {}` is rejected at the database level regardless of which RPC calls it — including the proxy and bulk paths identified in Step 1. Verification: a regression test asserting the trigger rejects that write on each identified path.

**Step 6 — Docs, policy, tests.**
ADR-197 (`AR-STAGE-SUBMIT-SCORE-COMPLETENESS`), POLICY entry, corrected `overall_status` naming in the ERD doc, unit tests for the display classifier and the trigger, mock data for both cohorts.

## Risk and impact

- **Data:** Steps 1–3 are read-only or presentation-only. Step 5 adds a rejecting trigger — additive, revertible by dropping it. No historical rows are rewritten; no auto-completion.
- **Workflow:** Step 4 keeps the 26 instances pending until re-scored, which is the correct state. Department heads get extra work — unavoidable, the scores were never captured.
- **Regression:** The trigger could block a legitimate narrative-only stage if the criteria count is computed wrongly. Mitigated by reusing `annual_review_stage_scoreable_criteria_count`, which already handles the system-scores ≥ 100 case.
- **Scale:** Diagnostic RPC is per-cycle and paginated at the call site; the affected set is under 100 rows.
- **Rollback:** Drop the trigger, revert the display commit. No destructive change to roll back.

## Immediate answer on 101279

The department head wrote and saved the recommendation but never entered the ten criteria scores, and the 27 July repair sweep correctly pushed the review back to `Dept Head Review Pending`. Nothing was deleted — the recommendation is intact — but the scores must be entered by the department head before this review can move to the BU Head.

## Assumptions

- The BU Head's existing (unlocked) scores are the intended final BU assessment; no re-scoring is needed.
- Only these two instances are affected — verified: they are the only two in the whole system sitting at `pending_bu` with a fully-scored unlocked BU draft.

## What the data actually shows (verified)

| | 100508 Satyam Kumar Jha | 101676 Satyaban Roy |
|---|---|---|
| Status | `pending_bu` | `pending_bu` |
| Enabled stages | self → dept_head → bu_head | self → dept_head → bu_head |
| Self | locked | locked |
| Dept Head (Prabhat Kumar Singh) | locked, re-submitted 26-Jul 04:11 | locked, re-submitted 25-Jul 10:30 |
| BU Head (Sindhu Raj Singh) | 19/19 criteria scored, weighted 195, **not locked, never submitted** | 19/19 criteria scored, weighted 231, **not locked, never submitted** |
| Aggregates | total/rating/finalized all empty | total/rating/finalized all empty |

Stage-transition history (from notification metadata) explains it:

```text
101676:  25-Jul 10:27:34  completed   -> pending_bu    (review re-opened)
         25-Jul 10:27:51  pending_bu  -> pending_dept  (BU sent it back to Dept)
         25-Jul 10:30:14  pending_dept-> pending_bu    (Dept re-submitted)  <- stuck here

100508:  25-Jul 13:07:21  completed   -> pending_bu    (review re-opened)
         25-Jul 13:07:42  pending_bu  -> pending_dept  (BU sent it back to Dept)
         26-Jul 04:11:11  pending_dept-> pending_bu    (Dept re-submitted)  <- stuck here
```

So this is **not** a workflow bug. Both were completed, then deliberately re-opened; the re-open correctly unlocked the BU response and cleared the aggregates but **preserved the BU's scores** (per the send-back preservation policy). Reports therefore still show BU scores, which reads as "BU review done", while the workflow correctly awaits a fresh BU sign-off that was never given.

## Risk & Impact Report

- **Data impact:** Locks 2 existing `annual_review_responses` rows and writes `total_score`, `criteria_weighted_score`, `final_rating`, `finalized_at/by`, `overall_status='completed'` on 2 instances. No schema change. Additive only.
- **Workflow impact:** These two leave Sindhu Raj Singh's queue and appear as Completed for the employees, Dept Head and upline. The `trg_ar_no_downstream_rewind` and BU-terminal guards remain satisfied (bu_head is the last enabled stage).
- **UI/UX impact:** None — no component changes in this option.
- **Regression risk:** Low, and scoped by an explicit 2-ID whitelist. Main risk is recomputing aggregates differently from the normal submit path.
- **Mitigation:** Reuse the same server-side aggregate routine the normal submit uses (`annual_review_compute_final_summary` / `annual_review_compute_final_score`) rather than hand-computing; snapshot before/after into an audit table; a one-statement rollback is available from that snapshot.

## Plan

1. **Pre-snapshot** — insert the current instance + BU response state for both IDs into a new audit table `annual_review_bu_draft_finalise_2026_07` (instance_id, employee_code, prior_status, prior lock/submitted state, criteria_scores, weighted_score, reason, performed_by = NULL for system-applied, applied_at). *Verify: 2 rows captured.*
2. **Lock the BU responses** — set `is_locked = true`, `submitted_at = now()` on the two `bu_head` rows, leaving scores untouched. *Verify: both rows locked with 19 criteria intact.*
3. **Finalise the instances** — call the existing final-summary routine so `criteria_weighted_score`, `total_score` and `final_rating` are derived exactly as a normal BU submit would, then set `overall_status='completed'`, `finalized_at=now()`. *Verify: both rows have non-null score + rating, status completed.*
4. **Post-checks** — re-run the "pending_bu with fully-scored unlocked BU draft" detector (expect 0), confirm no guard trigger fired, and confirm the two employees now appear under completed reviews in the hierarchy view. *Verify: detector returns 0.*
5. **Regression test** — `src/test/annualReview/buDraftFinalise.test.ts` asserting: a re-opened→sent-back→re-submitted instance with a scored-but-unlocked terminal response is reported as *awaiting terminal sign-off* (not completed), and that finalising it derives the score from the preserved draft rather than zeroing it.
6. **Docs & policy** — `docs/adr/ADR-185.md` (Re-open preserves reviewer drafts; terminal stage still needs an explicit re-submit), append **POLICY §AR-REOPEN-REQUIRES-TERMINAL-RESUBMIT**, bump `DOCUMENTATION.md` version history, and register the rule in project memory.

## UI Changes

Not Applicable for this option (chosen: admin-finalise only). Note for later: the grid still shows BU scores for a re-opened review, which is what made this look like a bug — a "draft, not submitted" badge would remove the ambiguity. Say the word and I'll add it.

## Rollback

`annual_review_bu_draft_finalise_2026_07` holds the full prior state; one update restores both instances to `pending_bu` and unlocks the BU responses.

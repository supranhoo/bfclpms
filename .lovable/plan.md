## 1. Assumptions

- The employee codes given are for the current (FY2026-07) annual review cycle; each has exactly one instance, all `completed`.
- The correct score is whatever `public.annual_review_compute_final_summary(instance_id)` returns — the existing server-side SSOT. No reviewer-entered data changes.
- You listed 41 codes but said 42; a 42nd instance is affected by the same defect (blank rating) and is included below.

## 2. Clarifications

None blocking. One decision to confirm during implementation: whether affected employees should be notified that their displayed rating changed (default: no notification, audit log only).

## 3. Confirmed findings (verified against the database)

All 41 listed employees have a completed instance where:

- `total_score` = `criteria_weighted_score` = the **raw weighted criteria sum** (255 … 450), not the normalised 0–100 value.
- `final_rating` is **blank** (so the UI and reports show no rating band).
- System-score points (Safety/HR/Production etc., 7–19 pts each) are **not included** in the stored total.

Recomputing with `annual_review_compute_final_summary` gives sane values for every one of them, e.g.:

```text
code    stored total   correct total   correct rating
101755  370.00         92.00           Outstanding
101909  450.00         97.00           Outstanding
100323  255.00         67.00           Average
100216  260.00         70.00           Good
101707  270.00         68.60           Average
```

Blast radius: of 2,019 completed instances, exactly **41** have `total_score > 100`, and exactly **42** have a blank `final_rating`. The 42nd is **100638 Lakhee Kant Mahto** — total is correctly normalised (79.60) but the rating band is blank.

Root cause evidence: all 41 were finalized on 18-Jul and 20-Jul, and all 41 share an identical `updated_at` of `2026-07-24 12:19:03.863653+00` — a single bulk backfill script rewrote `total_score` from the raw criteria sum and cleared `final_rating`, bypassing the compute SSOT. There is currently **no database trigger enforcing the 0–100 scale or rating presence** on `annual_review_instances` (17 triggers exist; none covers score scale).

## 4. Five Whys

1. Why is the final score wrong? — `total_score` holds a raw weighted sum, not the 0–100 normalised score.
2. Why is it raw? — A 24-Jul bulk repair wrote `criteria_weighted_score` straight into `total_score`.
3. Why did it write raw? — The script did its own arithmetic instead of calling `annual_review_compute_final_summary`.
4. Why was that allowed? — No invariant blocks an out-of-range `total_score` or a completed instance with no `final_rating`.
5. Why no invariant? — ADR-126 fixed the then-known instances but did not add a permanent guard, so any later write path can reintroduce the defect.

## 5. Risk & impact

- **Data**: 42 rows updated (score/rating only). Reviewer responses, system scores and workflow state untouched. Fully reversible from the pre-image audit table.
- **Workflow**: none — all instances stay `completed`.
- **UI/UX**: affected employees' scorecards, admin grid and the Annual Review report will begin showing a normalised score and a rating band. Ratings may move for downstream consumers (increment/incentive eligibility) — flagged below.
- **Regression risk**: the new trigger could reject legitimate writes. Mitigated by scoping it to `total_score` range only and allowing NULL during in-flight stages.
- **Scalability**: one-off update over 42 rows; the trigger is O(1) per row.

## 6. Step-by-step plan

1. **Audit table** — create `annual_review_final_score_repair_2026_07` capturing, per instance: employee code, old/new `criteria_weighted_score`, `total_score`, `final_rating`, template id, reason, `performed_by`, timestamp. *Verify: 42 pre-image rows inserted before any update.*
2. **Recompute repair** — update the 42 instances from `annual_review_compute_final_summary(id)` (total + rating; `criteria_weighted_score` stays as the raw weighted sum, which is its correct meaning). *Verify: zero completed instances with `total_score > 100` or blank `final_rating`.*
3. **Invariant trigger** — add `trg_ar_total_score_scale` (BEFORE INSERT/UPDATE OF `total_score`, `final_rating`) raising an exception when `total_score` is outside 0–100, and stamping the rating via `annual_review_resolve_final_rating` when a completed instance has a score but no rating. *Verify: a deliberate `UPDATE ... total_score = 315` is rejected.*
4. **Drift monitor** — extend the existing admin data-integrity surface with a read-only "final score out of range / missing rating" count so a recurrence is visible without a support ticket.
5. **Regression tests** — `src/test/annualReview/finalScoreScale.test.ts` covering: raw-sum input is normalised, rating bands map correctly at boundaries (Average/Good/Outstanding), and blank rating with a present score is not a valid completed state.
6. **Docs** — `docs/adr/ADR-187.md` and `POLICY.md` §AR-FINAL-SCORE-SCALE-INVARIANT; memory entry under `mem/features/annual-review/`.

## 7. UI changes

- No layout changes. The 42 affected employee scorecards, the admin progress grid and the Annual Review report will simply render a 0–100 score and a rating chip where they previously showed an inflated number and an empty rating.
- New (admin-only) integrity counter row on the existing data-integrity panel; no new navigation.

## 8. Rollback

`UPDATE ... FROM annual_review_final_score_repair_2026_07` restores every pre-image value; `DROP TRIGGER trg_ar_total_score_scale` reverts the guard. No schema is dropped or altered destructively.

## 9. Follow-up to confirm with you

If increment or incentive runs for this cycle already consumed the inflated `total_score` for any of these 42, those runs need recomputation. I will report which runs referenced them and will **not** recompute anything outside the annual review without your go-ahead.

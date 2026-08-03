# Backfill missing criterion ratings and recompute final scores (ADR-243)

## Assumptions
- Source of truth is the uploaded `Missing_Entry.xlsx` — 138 rows, 139 missing rating slots, all on **completed** reviews.
- 76 slots carry a rating you entered (values 2–5). 63 are still blank.
- Blank slots are filled by inheriting the adjacent stage's rating for the same criterion (confirmed): HOD blank → take Self; BU blank → take HOD, else Self.
- This is a one-off audited data repair, not a new admin screen.

## Clarifications
Resolved by your answers: apply the 76, inherit for the 63, one-off repair.

## Risk & Impact Report
- **Data impact:** writes new keys into `annual_review_responses.criteria_scores` on 138 locked responses, recomputes `weighted_score` for those responses and `total_score` / `final_rating` on 109 completed instances. Scores can only go **up** (a missing criterion contributes 0 today).
- **Workflow impact:** none — no status changes, no send-backs, reviews stay `completed`.
- **UI impact:** none. Final Rating (/5), Slab %, Bell Curve and the Annual Review Report all read the recomputed values automatically.
- **Regression risk:** the stage-score guard and closed-cycle guard triggers both fire on update. Handled with the sanctioned `SET LOCAL annual_review.bypass_stage_score_guard = 'on'` repair path, inside one transaction.
- **Scalability:** 138 rows / 109 instances — single transaction, no pagination concern.
- **Rollback:** every prior `criteria_scores`, `weighted_score`, `total_score` and `final_rating` is snapshotted before the write; a one-statement restore from that table reverses the whole run.

## Steps
1. **Snapshot** — create `annual_review_criteria_backfill_2026_08` (instance id, response id, stage, criterion id/name, old → new score, source `sheet` / `inherited_hod` / `inherited_self`, old/new weighted score, old/new total score and rating, actor, reason). Admin-read only, RLS on.
2. **Resolve values** — map each sheet row to its response and criterion id from the effective template. Rows whose criterion is not visible to that stage, or already scored, are skipped and reported rather than forced.
3. **Write** — merge the resolved score into `criteria_scores` and recompute `weighted_score` for that response.
4. **Recompute finals** — call `annual_review_compute_final_summary` for each touched instance (the single sanctioned writer, per §AR-FINAL-SCORE-SCALE-INVARIANT) and log the correction in `annual_review_access_audit`.
5. **Verify** — deliver a before/after Excel: each employee's old vs new total score and Final Rating (/5), plus every skipped row with its reason.

## Governance
- ADR-243 + POLICY §AR-CRITERION-BACKFILL: criterion backfill is reason-bound, snapshot-backed, and always followed by a final-summary recompute.
- This repair does **not** replace the ADR-242 trigger hardening (blocking future partial submissions) — that stays a separate, still-open item.

## Technical notes
- Write path: new `SECURITY DEFINER` RPC `admin_backfill_annual_review_criteria(p_rows jsonb, p_reason text)` guarded by `has_role(auth.uid(),'admin')`, executed once with the sheet payload. No UI surface is added.
- The new table lives in `public`, so `get_backup_table_order()` picks it up automatically — no denylist entry needed.
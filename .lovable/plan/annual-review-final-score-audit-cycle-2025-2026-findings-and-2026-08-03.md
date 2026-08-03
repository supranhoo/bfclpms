# Annual Review final-score audit (cycle 2025-2026) — findings and correction plan

## What I audited (all verified against live data, no assumptions)

Scope: cycle "Annual Review - 2025-2026", 2,580 instances (2,086 completed, 493 excluded).
Method: for every completed, non-excluded instance I re-ran the sanctioned server SSOT
`annual_review_compute_final_summary(instance_id)` (read-only) and compared it against the
stored `total_score`, `final_rating` and `criteria_weighted_score`.

### Clean checks (no action needed)

- 0 completed reviews with a missing final score (ADR-232 holds).
- 0 scores outside 0-100, 0 completed reviews with a blank rating band (ADR-187 holds).
- 0 instances carrying orphan system-score slots (ADR-234 holds).
- 0 duplicate instances per employee/cycle; 27 calibrations, all valid (0-5) and all pointing at real instances.

### Irregularities found

**1. 104 completed reviews carry an understated final score (the material defect)**

- Every one of the 104 has a stored `total_score` *lower* than the SSOT recomputation.
- Average understatement 1.65 points, maximum 17.00 points (Sumit Kumar 102011: stored 53.00
  vs correct 70.00 — his entire 17 points of system score is missing from the stored total).
- 6 of them also sit in the wrong rating band, e.g. 102011 is banded "Poor" but computes to
  "Good"; 100114 (Puttu Lal Ram) 41.60 -> 51.60; 100132 and 101688 move Poor -> Average.
- Because the report derives Final Rating (/5) and the increment slab from `total_score`,
  these employees are currently reported — and would be paid — on an understated rating.

**2. Confirmed root cause (not inferred — audit-trail matched)**

All 104 instances have a `system_scores.admin_override` entry in `annual_review_access_audit`,
i.e. they were touched by the bulk system-score upload (30 Jul: 79 rows, 1 Aug: 25 rows).
Reading the function source: `admin_apply_system_scores_upgrade` writes `system_scores` /
`system_scores_raw`, but sets `total_score` from a *caller-supplied* `p_total_score` under a
monotonic "only if greater" guard, and never calls `annual_review_apply_final_summary`.
So the new system points landed on the instance while the final score kept its pre-upload value.
The same omission exists in `admin_apply_system_scores_correction` and
`admin_update_system_scores_raw`.

5-Why: report rating wrong -> stored total_score understated -> system points added without
recompute -> the upgrade RPC trusts a client-passed total -> `total_score` has no single
enforced writer for the admin score-edit path (ADR-187 named `apply_final_summary` the sole
sanctioned writer, but these three RPCs bypass it).

**3. Three low-volume anomalies**

- 2 completed instances have no `finalized_at` timestamp (audit-trail gap, score is correct).
- 1 excluded instance still carries a `total_score` (will surface a rating for an excluded employee).
- 1 non-completed instance carries a `total_score` (premature score).
- 1 instance (101896) has `criteria_weighted_score` NULL where the SSOT computes 0.

## Fix

**A. Close the write path (prevents recurrence)**
- `admin_apply_system_scores_upgrade`, `admin_apply_system_scores_correction` and
  `admin_update_system_scores_raw`: after persisting system scores, call
  `annual_review_apply_final_summary(instance_id, allow_overwrite := true, source := 'system_score_edit', reason := ...)`
  instead of accepting a client-supplied total. `p_total_score` / `p_final_rating` become ignored
  (kept for signature compatibility) and the returned payload reports the recomputed values.
- Result recorded in `annual_review_final_score_recompute_audit` as today, so every change is reversible.

**B. Repair the 104 instances**
- Audited batch run of `annual_review_apply_final_summary` (reason: ADR-235 system-score
  upload recompute), before/after captured per instance.
- Dry-run listing of all 104 before/after scores and bands for sign-off before applying.

**C. Clean the three anomalies**
- Backfill `finalized_at` on the 2 completed instances from the terminal stage submission time.
- Null out `total_score` / `final_rating` on the excluded and the non-completed instance
  (audited), so no rating is reported for them.
- Normalise the NULL `criteria_weighted_score` to the computed value.

**D. Standing monitor**
- Extend `FinalScoreIntegrityCard` (Orphaned Reviews admin tab) with a third check:
  "Stored final score differs from recomputed" — a server RPC compares stored vs
  `annual_review_compute_final_summary` for the cycle and returns the count plus the drifted
  employees, with an admin "Recompute selected" action reusing the existing ADR-232 RPC.

**E. Tests + docs**
- Unit tests: score-edit path returns SSOT-recomputed total; drift classifier flags a
  stored-vs-computed mismatch; excluded/non-completed instances report no rating.
- ADR-235, POLICY §AR-FINAL-SCORE-SINGLE-WRITER, DOCUMENTATION.md version history.

## Risk and impact

- **Data:** 104 stored scores rise (avg +1.65, max +17); 6 employees move up a rating band and
  therefore up an increment slab. This is a correction of an understatement, not a regression.
- **Workflow:** none — all affected instances are already completed; no stage changes.
- **UI:** report and front-end agree afterwards; only the new monitor row is added.
- **Regression risk:** medium on the three RPCs (shared by the bulk upload screen). Mitigated by
  routing them through the existing SSOT rather than new maths, plus the dry-run and unit tests.
- **Rollback:** the recompute audit table stores prior score/band per instance; a reverse
  migration can restore them.

## Confirmation needed before I apply the repair

The 6 band changes (e.g. 102011 Poor -> Good, 100132 and 101688 Poor -> Average) change increment
slabs. Confirm the corrected scores should be applied as-is, or whether HR wants to review the
dry-run list first.

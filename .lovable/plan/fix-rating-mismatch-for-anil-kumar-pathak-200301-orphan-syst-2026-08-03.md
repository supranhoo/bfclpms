# Fix rating mismatch for Anil Kumar Pathak (200301) — orphan system-score points inflate the final score

## What the investigation found (verified in the database)

Anil Kumar Pathak's review is **completed** and mapped (via a template override) to
**"Generic M - (With KRA)"**, a template whose entire scoring is one `carry_kra` slot
(`sys_bgd6797`, weight 100).

His stored `system_scores` are:

```text
sys_bgd6797  = 49.8   <- the only slot that belongs to his current template
sys_2z4e0vw  = 10.0   <- left over from his PREVIOUS template (CLU - M - Operation)
sys_3jsce5p  = 25.0   <- left over from his PREVIOUS template
--------------------------------
total_score  = 84.80  (49.8 + 35 orphan points)
```

Consequences:
- The front-end Self /5 (2.49) is **correct**: 49.8 / 100 x 5 = 2.49.
- The stored Final Score (84.80) and band ("Good") are **wrong**: they include 35 points
  from slots that no longer exist on his template. The correct value is 49.80 -> rating
  2.49 / 5 -> band "Poor".
- The report's "Final Rating (/5)" is derived as final score / 20, so it shows ~4.2
  (84.2 / 20 = 4.21 at the time of the export; the row now stands at 84.80 / 20 = 4.24)
  next to a Self column of 2.49 — the mismatch the user reported.

Why the score moved: an ADR-232 repair on 3 Aug 05:26 wrote `total_score = 35.00`
(the orphan points alone, KRA slot not yet snapshotted), and a later recompute added
the KRA 49.8 on top, landing at 84.80. Both figures are contaminated by orphan keys.

Blast radius (same cycle, 2025-26): **10 of 2,580 instances** carry orphan system-score
keys — 200301 (35 pts), 101018 and 101798 (12 pts each), 200862 (14), 100601, 101755,
200098, 100432, 100002, 100429 (2 pts each).

## Root cause / 5-Why

1. Report rating disagrees with the front-end Self rating.
2. Because Final Score (84.80) is not derived from the same template slots as the Self /5.
3. Because `system_scores` retains keys from the template the employee was moved off.
4. Because the template-swap remap (ADR-116/166) maps known slots by `library_key` but
   never **prunes** keys that have no counterpart in the new template.
5. Because the final-score computation sums the whole `system_scores` JSONB instead of
   summing only slots declared by the effective template.

## Fix

**1. Make the score computation template-scoped (the real fix)**
- In `annual_review_compute_final_summary()` (the sole sanctioned writer of
  `total_score` / `final_rating`, ADR-187), sum system-score points only for slot ids
  present in `sections->'system_scores'` of the effective template
  (`COALESCE(template_override_id, template_id)`). Orphan keys are ignored, never summed.
- Mirror the same rule client-side in `src/lib/annualReview/scoringComposition.ts` /
  `kraDerivedRating.ts` so projections match the server.

**2. Prune orphans on template swap**
- Extend the existing template-swap remap trigger so that, after `library_key` remapping,
  any remaining key not declared by the new template is moved into an audit column /
  audit table and removed from `system_scores`. No silent data loss.

**3. One-off repair of the 10 affected instances**
- Audited migration: strip orphan keys into `annual_review_system_score_edits`
  (reason recorded), then call `annual_review_compute_final_summary()` for each instance
  so `total_score` / `final_rating` are rewritten by the sanctioned writer.
- 200301 becomes 49.80 -> 2.49 / 5 -> "Poor" (consistent with his Self column).
- Reversible: the pre-repair `system_scores` and score values are stored in the audit row.

**4. Drift monitor**
- Add an "Orphan system-score keys" check to the existing `FinalScoreIntegrityCard`
  (Orphaned Reviews admin tab) so future occurrences surface without a support ticket.

**5. Tests + docs**
- Unit tests: template-scoped summation ignores orphan keys; KRA-only template yields
  rating = points / weight x 5; swap pruning keeps remapped keys.
- ADR-234 + POLICY §AR-SYSTEM-SCORE-TEMPLATE-SCOPE, DOCUMENTATION.md version history.

## Risk and impact

- **Data:** 10 instances change score/band; 200301 drops from "Good" to "Poor". This is a
  correction, not a regression — confirm before the repair migration runs.
- **Workflow:** none; all instances are already completed and the writer path is unchanged.
- **UI:** report and front-end will agree; no layout change.
- **Regression risk:** low-medium — the computation function is shared. Mitigated by unit
  tests plus a dry-run listing of before/after scores for all 2,580 instances in the cycle
  before applying.
- **Rollback:** audit rows hold the prior `system_scores` and scores; a reverse migration
  can restore them.

## Confirmation needed

Correcting 200301 to **49.80 / "Poor"** changes his increment slab. Confirm that this
re-rating should be applied (versus recording an admin calibration to hold his current
outcome) before I run the repair.

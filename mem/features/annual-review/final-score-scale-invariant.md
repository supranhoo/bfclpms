---
name: Annual Review Final Score Scale Invariant
description: total_score is always 0-100 and completed reviews always carry a rating band; compute_final_summary is the only writer (ADR-187)
type: feature
---
`annual_review_instances.total_score` is ALWAYS a normalised 0–100 value.
`criteria_weighted_score` is the raw Σ(weight × score) sum and may exceed 100 —
never copy it into `total_score`. `public.annual_review_compute_final_summary()`
is the only sanctioned writer for `total_score` / `final_rating`; bulk repair
scripts must call it. A completed review with a score must have a non-empty
`final_rating`, resolved by `annual_review_resolve_final_rating()` against the
configurable `auto_final_rating_thresholds` setting.

Enforced by trigger `trg_ar_total_score_scale`. Client mirror:
`src/lib/annualReview/finalScoreScale.ts`. Drift monitor:
`FinalScoreIntegrityCard` on the Orphaned Reviews admin tab. 2026-07-27 repair
of 42 instances audited in `annual_review_final_score_repair_2026_07`.
See ADR-187 / POLICY §AR-FINAL-SCORE-SCALE-INVARIANT.

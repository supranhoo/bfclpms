---
name: Stage Score Requirement
description: No annual-review stage may lock a response with zero criteria scores; unscored locked stages render as "—" not 0.0
type: feature
---
POLICY §AR-STAGE-SCORE-REQUIRED (ADR-172).

- Every stage (self AND reviewer stages) must score all criteria visible to it before submit. Never gate this validation on `role === 'self'`.
- SSOT: `src/lib/annualReview/stageScoreGuard.ts`. Visibility via `criteriaForStage` / `shouldHideCriteriaCard`.
- Exempt: narrative-only stages (system_scores weights ≥ 100, or no criteria mapped to the stage).
- Server invariant: trigger `trg_ar_stage_score_required` on `annual_review_responses` (covers all writers). Repairs bypass with `SET LOCAL annual_review.bypass_stage_score_guard = 'on'`.
- Display: locked response + 0 scored criteria on a scoreable template = data gap → render `—`. `fetchInstanceStageScores()` returns null for these.
- July 2026 repair audit: `annual_review_empty_stage_repair_2026_07` (30 instances re-opened).

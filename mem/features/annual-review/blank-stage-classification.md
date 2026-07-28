---
name: Annual Review — blank stage score classification
description: narrative_only vs unscored classification for empty criteria_scores, diagnostic RPC and Unscored Stages admin tab (ADR-197)
type: feature
---
POLICY §AR-STAGE-SUBMIT-SCORE-COMPLETENESS (ADR-197).

- Empty `annual_review_responses.criteria_scores` means either **narrative_only** (template gives the stage 0 weighted criteria — blank is correct, grid shows "Narrative") or **unscored** (criteria exist but were skipped — must be re-scored).
- SSOT pair: `public.annual_review_stage_scoreable_criteria_count()` and `stageScoreableCriteriaCount()` in `src/lib/annualReview/kraStageDisplay.ts`. Keep in sync.
- `resolveStageDisplayRating` sources: `criteria` | `kra` | `narrative` | null.
- Diagnostic RPC `annual_review_unscored_stage_diagnostic(p_cycle_id)` (admin/hr_pms, read-only) → Annual Review admin → **Unscored Stages** tab.
- Never back-fill zeros or force-complete the unscored cohort; `trg_ar_stage_score_required` (ADR-172) prevents new ones.

---
name: System scores are template-scoped
description: Only slots declared by the effective annual-review template may contribute points; orphan keys are pruned and audited (ADR-234)
type: feature
---
`annual_review_instances.system_scores` may only hold slot ids declared by the
effective template (`COALESCE(template_override_id, template_id)`).
`annual_review_compute_final_summary()` sums declared slots only — never
`Object.keys(system_scores)`. Template swaps auto-prune leftovers via
`trg_ar_prune_orphan_system_scores`, logging each removal to
`annual_review_system_score_edits`. Repair:
`annual_review_prune_orphan_system_scores(cycle, reason, dry_run)`; diagnostic:
`annual_review_orphan_system_scores(cycle)`. Client mirror:
`src/lib/annualReview/systemScoreScope.ts`; monitor card on Orphaned Reviews tab.
See ADR-234 / POLICY §AR-SYSTEM-SCORE-TEMPLATE-SCOPE.

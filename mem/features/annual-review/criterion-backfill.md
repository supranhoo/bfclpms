---
name: Criterion Rating Backfill
description: Audited admin path for filling missing criterion ratings on locked annual-review stages (ADR-243)
type: feature
---
POLICY §AR-CRITERION-BACKFILL (ADR-243).

- Missing individual criterion ratings on a locked stage silently deduct points,
  because `annual_review_compute_final_summary` only sums criteria present in the
  terminal stage's `criteria_scores`.
- Only write path: `admin_backfill_annual_review_criteria(p_rows jsonb, p_reason text)`
  — admin-only, reason ≥ 10 chars, never overwrites an existing score, recomputes
  the response `weighted_score` and then the instance via
  `annual_review_compute_final_summary`.
- Audit: `public.annual_review_criteria_backfill_2026_08` (admin-read, RLS on).
- Blank HOD slots inherit the Self rating (`value_source = 'inherited_self'`);
  missing **self** ratings can never be inherited — send the review back instead.
- 2026-08-03 run: 139 ratings / 103 instances, 22 rating-band changes.

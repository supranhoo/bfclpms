---
name: Recommendation Tracking
description: Structured Dept/BU/Management recommendation capture, HR decision queue and audit rules (ADR-226)
type: feature
---
# Annual Review recommendation tracking (ADR-226, POLICY §AR-RECOMMENDATION-TRACKING)

- Narrative recommendations stay in `annual_review_responses.qualitative_responses['__overall_recommendation']` (SSOT for wording). The structured ask is a *separate* record; never overwrite the prose with it.
- Tables: `annual_review_recommendation_types` (master data — promotion, special_hike, one_time_reward, grade_change, role_change, training, none), `annual_review_recommendations` (unique per instance_id + reviewer_role), `annual_review_recommendation_items`.
- Writes are RPC-only: `ar_save_recommendation` (stage owner or Admin/HR/Management; blocked once the instance is completed), `ar_decide_recommendation`, `ar_bulk_decide_recommendations` (reason mandatory, audited as `recommendation.saved|decided|bulk_decided`).
- Reads for the governance queue go through `ar_recommendation_queue` — server-side paginated (25/page). Never client-load the full set.
- Never hardcode recommendation types in components; always read the master table.
- Approved monetary recommendations are proposals into the increment run — they must never change final score, rating or slab directly.
- UI: `StructuredRecommendationFields` inside `OverallRecommendationCard`; Annual Review Admin → **Recommendations** tab (`RecommendationsTab.tsx`).

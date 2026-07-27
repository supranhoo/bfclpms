---
name: Annual Review — Supersede must not rewind past actioned stages
description: ADR-183 rule for set_annual_review_enabled_stages supersede mode; removing a downstream stage promotes to completed with recomputed aggregates
type: feature
---

POLICY §AR-SUPERSEDE-NO-FALSE-REWIND (ADR-183, 2026-07-27).

`set_annual_review_enabled_stages(uuid, jsonb, text, text)` supersede branch:

1. Resolve the new status as the first **enabled** stage, in canonical order
   (`self, manager, skip_manager, dept_head, bu_head, hr, management`), with
   **no locked response**. Never `LIMIT 1` over raw JSON order.
2. All enabled stages actioned → `overall_status = 'completed'` and aggregates
   recomputed via `annual_review_compute_final_summary`. Do NOT null them.
3. `total_score / criteria_weighted_score / final_rating / finalized_*` are
   cleared only when landing on a real `pending_*`.
4. Archiving stays scoped to removed stages (`archive_annual_review_response`
   deletes the row after copying it into `annual_review_reset_archive`).

Repairs of this class log before/after into a dated table (first one:
`annual_review_bu_removal_repair_2026_07`). Narrative-only instances (empty
`criteria_scores`) must never be force-finalized to 0/"Poor".

Tests: `src/test/annualReview/supersedeTerminalPromotion.test.ts`.
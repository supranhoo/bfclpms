---
name: Annual Review — Reset rollback from archive
description: ADR-210 rules for undoing an erroneous force-reset using annual_review_reset_archive
type: feature
---
POLICY §AR-RESET-ROLLBACK (ADR-210, 2026-07-31).

- `annual_review_reset_archive` is the authoritative undo source for a force-reset: re-insert `wiped_responses` verbatim (same id, submitted_at, created_at, is_locked).
- Restore `prior_template_id` too — answer keys are template-scoped; restoring under a swapped template orphans them.
- Re-anchor `overall_status`: archived `prior_status` if its stage is still in current `enabled_stages`, else first enabled stage with no restored locked response, else `completed`. Never leave at `pending_self`.
- Reviewer mappings and `annual_review_assignment_overrides` created after the reset are NEVER rolled back.
- Legacy archive rows stored an instance snapshot object (not an array) in `wiped_responses` — only arrays are restorable responses.
- Snapshot before/after into a dated repair table with `performed_by = NULL`; keep the archive row.
- Exclusion must use `bulk_exclude_annual_review_instances`, not a reset.
- Resolver: `src/lib/annualReview/resetRollback.ts`. Tests: `src/test/annualReview/resetRollback.test.ts`.
- First application: instance `febfb82a…` / employee 101885 → self response `5846a084…` restored, template `a6e88cd5…`, status `pending_bu`.

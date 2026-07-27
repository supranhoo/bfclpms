---
name: Orphaned annual review reviewer succession
description: Detection RPC, bulk repair console and deactivation guard for annual review stages whose reviewer is inactive or unmapped (ADR-173)
type: feature
---

POLICY §AR-ORPHAN-REVIEWER-SUCCESSION (ADR-173, 2026-07-27).

- Orphan = enabled non-self stage on a non-terminal instance whose reviewer is NULL
  (`no_reviewer_mapped`) or inactive (`inactive_reviewer`).
- Detection SSOT: `public.get_orphaned_annual_reviews(p_cycle_id)`; TS mirror
  `src/lib/annualReview/orphanReview.ts` — the two MUST stay in sync.
- Repair: `public.admin_reassign_orphaned_reviewers(uuid[], stage, reviewer, reason)`
  (wraps `reassign_annual_review_reviewer`), snapshotting into
  `public.annual_review_orphan_repair_2026_07` (rollback source).
- UI: Annual Review Admin → **Orphaned Reviews** tab
  (`src/components/annual-review/OrphanedReviewsTab.tsx`).
- Prevention: `trg_alert_on_reviewer_deactivation` logs
  `reviewer_deactivated_orphan_risk` into `annual_review_access_audit`; warns, never blocks.
- **Gotcha:** org-master head cascade resolves BU membership via
  `profiles.department_id → departments.business_unit_id`. `profiles.business_unit_id`
  does NOT exist — referencing it silently broke the cascade for months.
- Succession is always org-master first (BU/Dept head), instance repair second.

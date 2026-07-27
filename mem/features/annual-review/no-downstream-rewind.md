---
name: Annual Review — No rewind past an actioned downstream stage
description: ADR-184 guard trg_ar_no_downstream_rewind, repair RPC and diagnostic; ADR-172 empty-stage rule is submission-time only
type: feature
---

POLICY §AR-REPAIR-NO-DOWNSTREAM-REWIND (ADR-184, 2026-07-27).

1. `annual_review_instances.overall_status` must never become a `pending_*`
   stage while an **enabled later stage** holds a locked response. Enforced by
   `trg_ar_no_downstream_rewind` → `tg_ar_no_downstream_rewind()`. Bypass only
   via session flag `annual_review.bypass_downstream_rewind_guard = 'on'` when
   the downstream response is unlocked/archived in the same transaction.
2. ADR-172 (`trg_ar_stage_score_required`) is **submission-time only**. Never
   sweep historic data to reopen empty upstream stages.
3. Terminal resolution: all enabled stages actioned → `completed` with
   aggregates recomputed by `annual_review_compute_final_summary`, never nulled.
4. Repair path: `annual_review_repair_downstream_rewind(uuid, text)`
   (admin/hr_pms, reason ≥3 chars) → logs to
   `annual_review_downstream_rewind_repair_2026_07`.
   Health check: `annual_review_downstream_rewind_diagnostic()` must be empty.
5. Ordinal helpers `annual_review_stage_ord(text)` /
   `annual_review_status_ord(text)` are the SQL SSOT for canonical stage order.

Tests: `src/test/annualReview/noDownstreamRewind.test.ts`.
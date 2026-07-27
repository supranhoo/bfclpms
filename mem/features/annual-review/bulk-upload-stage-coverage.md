---
name: Bulk upload stage coverage
description: Annual Review bulk System-KPI uploads must classify every instance status; mid-workflow rows need an explicit admin opt-in
type: feature
---
POLICY §AR-SYSTEM-SLOT-COVERAGE (ADR-186).

- A weighted System-KPI slot with NO stored value scores 0 of its weight — `annual_review_compute_final_summary` builds the denominator from template weights, so "missing" is never "excluded". Silent upload skips therefore depress final scores.
- Classify upload write-eligibility ONLY via `src/lib/annualReview/bulkStageCoverage.ts` (`classifyStageCoverage`). Three worlds: safe early stages (direct write), `completed` (ADR-171 opt-in), mid-workflow `pending_skip|dept|bu|hr|management` (ADR-186 opt-in). Both opt-ins route through `admin_apply_system_scores_upgrade` — monotonic, audit-logged, system_scores only.
- Never report a skip as a generic "Locked stage"; the reason must name the status, and the dry-run UI must show `skipsByStatus` badges so a cohort cannot hide behind one aggregate number.
- Applied 2026-07-27 to 100508 (51.00 Poor → 66.00 Average) and 101676 (58.20 Average → 73.20 Good); audit in `annual_review_missing_system_slot_repair_2026_07`.

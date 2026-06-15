---
name: Annual Review Carry KRA Score
description: Carry KRA Score system-score source that auto-fetches month-wise final achieved KPI scores from PMS history
type: feature
---
Annual Review templates support a System Score `source = 'carry_kra'`. When present:
- Service `src/services/annualReview/carryKraScore.ts` fetches `review_submissions` joined to `kpis` for the employee, filtered to the cycle's fiscal year (July fyStart → June fyStart+1). Per-month KPI scores cascade `final_score → auditor → manager → self`; `is_na` rows are excluded by default.
- Monthly KRA score = weight-aware average of KPI scores in that calendar month.
- Carry value fed into appraisal totals = **average of monthly avgs** across the months selected by `carry_config.aggregation` (`overall_avg` | `last_n_months` (lastN) | `selected_months`). The score weight is the appraisal cap; the value is NOT scaled to it.
- `SystemScoresPanel` renders a collapsible Monthly KRA Breakdown for carry_kra cards; numeric value is locked (computed). Requires `employeeId` + `fiscalYear` props.
- DB: `annual_review_instances.carry_score_snapshots jsonb` reserved for caching the snapshot per system_score id (additive; currently live-fetched via react-query with 60s stale).
- Template editor exposes the source dropdown + `CarryKraConfigEditor` inline.
- Template editor also mounts `CarryKraMappingPreview` (collapsible) so admins can pick any active employee + fiscal year and see the exact month-wise KRA mapping the appraisal will pull. Read-only; reuses `buildCarrySnapshot` as the SSOT (no duplicate aggregation).
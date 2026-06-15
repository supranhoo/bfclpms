---
name: Annual Review Carry KRA Score
description: Carry KRA Score system-score source — fetches month-wise approved KPI ratings (0-5) and scales (rating/5)*weight into appraisal percent points
type: feature
---
Annual Review templates support a System Score `source = 'carry_kra'`. When present:
- Service `src/services/annualReview/carryKraScore.ts` fetches `review_submissions` joined to `kpis` for the employee, filtered to the cycle's fiscal year (July fyStart → June fyStart+1). KPI scores are on a **0–5 scale** (`KPI_SCALE_MAX = 5`). Per-month KPI scores cascade `final_score → auditor → manager → self`; `is_na` rows are excluded by default.
- Monthly KRA rating = weight-aware (by KPI weightage) average of KPI scores in that calendar month, still on the 0–5 scale.
- `computeCarryRating(monthly, cfg)` returns the raw rating (0–5) across the months selected by `carry_config.aggregation` (`overall_avg` | `last_n_months` (lastN) | `selected_months`).
- `computeCarryContribution(rating, weight) = (rating / 5) * weight` is the SSOT scaling step → the percentage-point value persisted into `annual_review_instances.system_scores[<id>]`. NEVER persist the raw 0–5 rating directly (silently 20× too small).
- `buildCarrySnapshot(employeeId, fyStart, cfg, weight)` returns `{ monthly, rating, value, maxValue, fiscal_year, config, computed_at }`.
- `SystemScoresPanel` renders a Carry KRA card showing **Achieved (value)** / **Out of (maxValue=weight)** / **Rating /5** plus a collapsible Monthly KRA Breakdown (column header *Rating (/5)*). Side-effect sync of `value` into the instance lives in `useEffect`.
- DB: `annual_review_instances.carry_score_snapshots jsonb` reserved for caching the snapshot per system_score id (additive; currently live-fetched via react-query with 60s stale).
- Template editor exposes the source dropdown + `CarryKraConfigEditor` inline.
- Template editor also mounts `CarryKraMappingPreview` (collapsible) so admins can pick any active employee + fiscal year and see the exact month-wise KRA mapping the appraisal will pull. Read-only; reuses `buildCarrySnapshot` as the SSOT (no duplicate aggregation).
- Discoverability: System Scores empty state offers a one-click **"+ Add Carry KRA Score"** shortcut that inserts a pre-configured `source: 'carry_kra'` row (default `{ aggregation: 'overall_avg', excludeNa: true }`), immediately revealing the editor + preview. Carry KRA is a System Score source only — never exposed on Criteria rows (would break scoring math in `src/lib/annualReview/scoring.ts`).
- **FY mapping rule**: `fiscalYear` passed to `SystemScoresPanel` / `buildCarrySnapshot` is `fyStart` (July start year). Always derive via `fyStartFromCycle(cycle) = cycle.review_year - 1` from `src/lib/annualReview/fiscalYear.ts`. Cycle "Annual Review 2025-26" has `review_year=2026` → fyStart=2025 → fetches Jul 2025 → Jun 2026.
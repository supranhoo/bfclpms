---
name: Category Weightage Badge
description: "Performance by Category" header badge contract — KRA mapping integrity check
type: feature
---

# Performance by Category — Weightage Badge

Location: `src/components/review/UnifiedScorecard.tsx` (`fullAssignedWeight`).

## Contract

The badge next to "Performance by Category" displays the rounded **sum of weightages of every KPI mapped to the employee for the selected period**.

- Independent of `submission.is_na` — a Quarterly / Half-yearly / Annual KPI that is auto-N/A'd in a non-cycle-end month still counts.
- Independent of scoring status (unscored KPIs still count).
- Independent of the status filter applied to the chart (always uses the full `kpis` list).
- Green at exactly 100% (rounded), amber otherwise.

## Why

The badge is a **structural KRA-mapping integrity check** — it confirms that the KRA weightages assigned to the employee sum to 100%. Excluding frequency-driven N/A weightage produced false amber warnings (e.g. 95% for an employee with one 5% Quarterly KPI viewed in a non-cycle month), which mis-signalled a mapping gap that did not exist.

This is purely a presentation concern. `scoreData` (weighted score, donut, category bars) continues to correctly exclude `is_na` and unscored KPIs per POLICY §88 and `mem://architecture/pms/universal-scoring-logic`.

## Tests

`src/test/scorecard/categoryWeightageBadge.test.tsx` — covers full-mapping, quarterly auto-N/A inclusion, incomplete mapping (amber), rounding, and status-filter independence.

# Bell Curve Analysis — Annual Review Report (ADR-218)

A new **Bell Curve** tab inside the existing Annual Review Report (`/reports/annual-review`).
On-screen analytics only — the existing Excel download stays unchanged; a dedicated
Bell Curve export lives inside the tab itself.

## Assumptions
- Rating scale is 1–5, derived from the existing SSOT `toRatingOutOf5(total_score)` (ADR-212).
  Bands: 1 Unsatisfactory, 2 Needs Improvement, 3 Meets, 4 Exceeds, 5 Outstanding
  (a rating of 4.25 falls in band 4).
- Only non-excluded instances with a final score count; unrated employees are shown
  separately and excluded from the distribution denominator.
- Data source is the existing `fetchComprehensiveReport(cycleId)` dataset, which already
  carries department, business unit, division, manager and final score per employee.
- Rating-change audit already exists (Master Change History, ADR-213/215) and is linked,
  not rebuilt.

## Scope decisions
Brief item 12 (new Employees / Performance Ratings / Audit entities) is not rebuilt —
those already exist. Only one genuinely new config table is added. Item 13 (AI Insights)
is deferred to a follow-up so the core analytics ship clean.

## What gets built

### 1. Configuration (admin-editable, DB-stored, no hardcoded targets)
- `annual_review_bell_curve_config` — one active row per cycle plus a global default:
  target % per band (5/4/3/2/1), green threshold, amber threshold.
  Defaults: 10 / 20 / 40 / 20 / 10; green ±5%, amber ±10%, red >10%.
- Read: any authenticated user. Write: Admin / HR PMS only.
- Editor opens from a "Configure targets" button in the tab, visible to Admin / HR PMS.
  Targets must total 100% before save; validation blocks otherwise.

### 2. Calculation engine (pure, testable)
`src/lib/annualReview/bellCurve.ts` as the single source of truth:
- `bandForRating(rating)` → 1..5
- `computeDistribution(rows, config)` → per band: count, actual %, target %, variance %,
  compliance level (green / amber / red)
- `computeSummary(...)` → total employees, rated count, average rating, highest-band count,
  lowest-band count, overall bell-curve compliance %
- `groupDistribution(rows, key, config)` → same shape per department / BU / manager / location
- Recomputes automatically when filters or ratings change (React Query invalidation).

### 3. Visual dashboard (new tab)
- **KPI cards**: Total Employees, Average Rating, Highest Rating Count, Lowest Rating Count,
  Bell Curve Compliance %.
- **Bell curve chart**: smooth target normal curve overlaid with the actual distribution;
  X = 5 rating categories, Y = employee count; regions tinted green / amber / red by variance.
- **Distribution bar chart**: actual vs target counts per band with % labels.
- **Heat map**: Department (rows) × Rating band (columns); cell colour by deviation,
  click a department to filter the view.
- **Variance table**: band, count, actual %, target %, variance %, compliance chip.
- Recharts + semantic tokens so light and dark both work; responsive down to 375px.

### 4. Views and filters
View switch: **Organization / Business Unit / Department / Manager**.
Filters: Assessment Year (cycle), Business Unit, Department, Manager, Location.
Manager view shows the team distribution against the org target, flags over-rated and
under-rated bands, and gives plain-language normalization suggestions
(e.g. "2 employees above target in Outstanding — consider moving to Exceeds").

### 5. Access control
- Admin / HR PMS / Management / Auditor: all scopes.
- Manager / Skip-level: own reporting subtree only (reuses the existing annual review
  subtree resolver).
- Employee: no access unless an admin enables the view-only flag.
- Enforced in the UI and by the RLS already guarding the comprehensive report RPC.

### 6. Export (inside the Bell Curve tab only)
- **Excel**: Employee Distribution, Variance Analysis, Department Summary,
  Business Unit Summary, Manager Summary.
- **PDF**: KPI cards, bell curve graph image, variance table, department summary.

### 7. Audit
- Config changes (targets, thresholds) written to the standard audit log with actor and time.
- Rating-change history (previous → new, who, when) is surfaced via a deep link into the
  existing Master Change History report filtered to that employee — no duplicate store.

## Technical notes
- New table `annual_review_bell_curve_config` with GRANTs, RLS (read authenticated,
  write Admin/HR PMS) and an audit trigger.
- New files: `src/lib/annualReview/bellCurve.ts`, `src/hooks/useBellCurveConfig.ts`,
  `src/components/reports/annual-review/BellCurveTab.tsx` plus `BellCurveChart`,
  `DistributionBarChart`, `DepartmentRatingHeatmap`, `VarianceTable`,
  `BellCurveConfigDialog`, `bellCurveExport.ts`.
- Changed: `src/pages/reports/AnnualReviewReport.tsx` — one extra tab trigger and content.
  The existing report table and its Excel export are untouched.
- Volume: the comprehensive report already pages server-side via `fetchAllRpcPaged`;
  aggregation is O(n) in memory per cycle, memoised per filter set.
- Tests: `src/test/annualReview/bellCurve.test.ts` — band boundaries, variance signs,
  compliance thresholds, empty/unrated datasets, grouping, target-sum validation.
- Docs: ADR-218, `POLICY.md` §AR-BELL-CURVE, `DOCUMENTATION.md` version history.

## Rollback
Drop the config table and remove the tab. No existing data is mutated and no existing
report output changes.
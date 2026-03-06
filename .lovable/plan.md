

# Management Dashboard Enhancements

## Issues Identified

1. **Performance Trend** shows zero-score data points for months with no processed data, creating a misleading downward trend. Currently the trend chart already filters `periodScores.has(m)` (line 346), but the score calculation accumulates raw scores without weighting properly — and months where KPIs exist but have no submissions still show as 0.

2. **Top Performers showing 500%+**: The score formula `(total / weightage) * 100` (line 330) where `total = score * weightage` and scores are 0-5. So `(5 * 100 / 100) * 100 = 500%`. The multiplication by 100 is wrong — scores on a 0-5 scale should not be converted to percentage this way. Should display as the raw 0-5 rating or multiply by 20 (not 100).

3. **Bottom Performers**: Currently shows lowest scores across all selected months. Need to change to show employees with consistently low weighted average over the last 3 months.

4. **Department Performance**: Currently groups by department. Need to group by division instead (department → business_unit → division chain).

5. **Direct Reportees Section**: New section showing the logged-in user's direct reports with month-by-month score trend, clickable to navigate to monthly dashboard.

## Changes

### File: `src/pages/ManagementDashboard.tsx`

**Fix 1 — Performance Trend: Only show months with actual scored data**
- In the trend data computation (lines 336-347), skip KPIs where all submission scores are null/0 (no actual review data). This prevents months with only `kra_set` KPIs from dragging the line to zero.

**Fix 2 — Top Performers: Fix score display to use 0-5 scale**
- Line 330: Change `* 100` to `* 20` (or just show raw 0-5 score). Since the canonical scale is 0-5, display as `score.toFixed(2)` out of 5, not as a percentage.
- Update `TopBottomPerformers` component to display "/5" instead of "%".

**Fix 3 — Bottom Performers: Last 3 months weighted average**
- Compute bottom performers by fetching KPIs from the most recent 3 months that have data, calculating a weighted average per employee across those months, and returning the lowest 5.

**Fix 4 — Division Performance instead of Department**
- In the department stats aggregation (lines 271-297), resolve each employee's division through the chain: `profile.departments.business_units.divisions.name`.
- Need to fetch divisions data in the query. Update the profiles select to include `departments(name, business_units(name, divisions(name)))`.
- Rename labels from "Department" to "Division" in the UI section (lines 684-733).

**Fix 5 — New Direct Reportees Monitoring Section**
- Query direct reports of the current user (`reporting_manager_id = user.id`).
- For each reportee, compute monthly score for each month in the fiscal year that has data.
- Display as a table/card grid with mini sparkline or month-by-month scores.
- Each row is clickable, navigating to `/dashboard?employee={id}&period={month}&year={year}`.

### File: `src/components/management/TopBottomPerformers.tsx`
- Change score display from `{p.score.toFixed(1)}%` to `{p.score.toFixed(2)} / 5`.
- Update `getScoreColor` thresholds to work on 0-5 scale instead of 0-100.
- Update Bottom Performers description to "Lowest average over last 3 months".

### File: `src/components/management/PerformanceTrendChart.tsx`
- Change Y-axis domain from `[0, 100]` to `[0, 5]` to match the 0-5 rating scale.
- Update tooltip formatter accordingly.

## Risk Assessment
- **Data Impact**: None — read-only display changes
- **Regression Risk**: Medium — score display scale changes from percentage to 0-5 across multiple sections; need to ensure consistency with bell curve (which already uses 0-5)
- **UI Impact**: Positive — more accurate, actionable dashboard




## Fix: Frequency-Locked KPIs Showing Misleading Status in Reports

### Problem

When viewing reports for a specific month (e.g., January), Quarterly or Bi-Monthly KPIs that are **not due for review** in that month still appear with statuses like "KRA Set" or "Manager Check". This is misleading — these KPIs are locked by design and shouldn't appear as "stuck" or "pending".

For example, a Quarterly KPI with cycle Jan-Mar has `review_period = 'March'`. But if the report is filtered to January, two things can go wrong:
1. The KPI doesn't appear at all (filtered out by `review_period`), OR
2. If it was assigned with `review_period = 'January'` (older data before frequency resolution was enforced), it shows as stuck in an early stage — because no one is supposed to act on it until March.

### Affected Reports

| Report | File | Issue |
|--------|------|-------|
| Employee Performance Summary | `EmployeePerformanceSummary.tsx` | Shows Quarterly KPIs as "KRA Set" in non-terminal months, inflating pending counts |
| KPI Status Tracker | `KpiStatusTracker.tsx` | Shows locked KPIs as stuck with "Days in Stage" counting up |
| KPI Detail Report | `KpiDetailReport.tsx` | Includes locked KPIs in score columns with no scores, looking incomplete |

### Solution: Add Frequency-Aware Filtering + Visual Indicator

#### Approach A: Filter out locked KPIs (recommended default)

In all three reports, after fetching KPIs for the selected period, apply `isKpiLockedForPeriod()` to exclude KPIs whose frequency means they aren't due for review in the selected month. This matches how the dashboard and scorecards already work.

#### Approach B: Show with "Frequency Locked" badge (toggle option)

Some admins may want to SEE these KPIs to confirm they exist. Add a toggle: **"Include frequency-locked KPIs"** (default: OFF). When ON, show the KPIs but with a distinct "Frequency Locked" badge instead of the misleading workflow status.

**Recommendation**: Implement both — filter by default, with a toggle to reveal.

### Changes

#### 1. `src/pages/reports/EmployeePerformanceSummary.tsx`

- Import `isKpiLockedForPeriod` from `@/lib/frequencyUtils`
- After fetching KPIs (line ~165), also fetch `frequency` and `frequency_cycle_start` columns (add to the `.select()`)
- Before grouping KPIs into employee rows, filter: if `selectedPeriod !== 'all'` and `isKpiLockedForPeriod(kpi.frequency, selectedPeriod, kpi.review_year)` returns true, skip or tag the KPI
- Add `showLockedKpis` toggle state (default false)
- When toggle is ON: include locked KPIs but don't count them in `statusCounts` — instead add a separate `lockedKpiCount` field
- Show "Frequency Locked" badge in the Review Status column when all of an employee's non-approved KPIs are actually frequency-locked
- Update stat cards: "Approved" count should exclude frequency-locked KPIs from the denominator

#### 2. `src/pages/reports/KpiStatusTracker.tsx`

- Import `isKpiLockedForPeriod`
- Add `frequency` and `frequency_cycle_start` to the KPI select query
- Add `showLockedKpis` toggle
- When OFF (default): filter out locked KPIs entirely
- When ON: show with a "Locked" badge in the Status column and "N/A" in "Days in Stage" and "Pending At" columns
- Update summary cards to exclude locked KPIs from "In Progress" and "Pending" counts

#### 3. `src/pages/reports/KpiDetailReport.tsx`

- Same pattern: import frequency utils, add toggle, filter or tag locked KPIs
- When shown, display "Frequency Locked" in score columns instead of blank cells

#### 4. Shared toggle component (optional optimization)

Create a small `FrequencyLockToggle` component used by all three reports:
```
[x] Include frequency-locked KPIs (Quarterly, Bi-Monthly, etc. not due this month)
```

### Implementation Order

1. Add `frequency` + `frequency_cycle_start` to KPI queries in all 3 reports
2. Add filtering logic using `isKpiLockedForPeriod` in `EmployeePerformanceSummary.tsx`
3. Add the toggle UI and "Frequency Locked" badge
4. Repeat for `KpiStatusTracker.tsx` and `KpiDetailReport.tsx`

### Files Modified
- `src/pages/reports/EmployeePerformanceSummary.tsx`
- `src/pages/reports/KpiStatusTracker.tsx`
- `src/pages/reports/KpiDetailReport.tsx`

### No database changes needed


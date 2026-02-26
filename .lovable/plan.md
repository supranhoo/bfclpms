

# Show Multiple Review Statuses per Employee

## Problem
Currently, each employee row in the Employee Performance Summary shows only **one** status badge -- the highest-priority status among their KPIs. When an employee has KPIs at different stages (e.g., 2 at Self Review, 9 at Management, 2 Approved), only the highest stage is shown, which is misleading.

## Solution
Change the `status` field from a single string to a **map of status counts**, then render multiple badges (e.g., "Self Review (2)", "Management (9)", "Approved (2)"). If all KPIs are approved, show a single "Approved" badge.

## Changes

### File: `src/pages/reports/EmployeePerformanceSummary.tsx`

1. **Update `EmployeePerformance` interface** (line 62):
   - Change `status: string` to `statusCounts: Record<string, number>` to store count per status
   - Keep a derived `primaryStatus` for sorting/filtering compatibility

2. **Update KPI grouping logic** (lines 184-209):
   - Instead of picking the highest-priority status, accumulate counts per status
   - e.g., `{ self_review: 2, management_review: 9, approved: 2 }`

3. **Update table rendering** (lines 670-677):
   - If all KPIs are approved, show single "Approved" badge
   - Otherwise, render a badge for each non-zero status with a count suffix: "Manager Check (2)"
   - Badges sorted by workflow priority (earliest stage first)

4. **Update status filter logic** (line 327):
   - Filter matches if the employee has **any** KPIs in the selected status

5. **Update Excel export** (lines 448-467):
   - Export as comma-separated list: "Manager Check (2), Management (9), Approved (2)"

6. **Update `summaryStats` approved count** (line 485):
   - An employee row counts as "approved" only if all their KPIs are approved (i.e., only status in the map is "approved")

## Technical Details

### Data Structure Change
```text
Before: { status: "management_review" }
After:  { statusCounts: { self_review: 2, management_review: 9, approved: 2 } }
```

### Badge Rendering Logic
- Sort statuses by workflow priority (kra_set first, approved last)
- Show each as: Badge with count in parentheses when count > 1
- Compact layout using flex-wrap with small gap

### Filter Compatibility
- Status dropdown filter checks if `statusCounts[selectedStatus] > 0`
- "All Status" shows everything as before

## Risk Assessment

| Aspect | Risk | Mitigation |
|--------|------|------------|
| Data impact | None -- display-only change | No schema changes |
| Regression | Low -- same data, different presentation | Status filter logic preserved |
| UI overflow | Multiple badges may widen the column | Use flex-wrap and smaller badge text |


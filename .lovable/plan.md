

## Show 10 Top/Bottom Performers Using Only Approved KPIs

### Problem
1. Top and bottom performer lists show only 5 entries — user wants 10 each.
2. The calculation includes KPIs of any status — user wants only `status === 'approved'` KPIs counted.

### Changes

#### File: `src/pages/ManagementDashboard.tsx`

1. **Top Performers (lines 315-347)**: Add `if (kpi.status !== 'approved') return;` at the start of the `kpis.forEach` loop that builds `employeeScoreMap` (line 316). Change `.slice(0, 5)` to `.slice(0, 10)` on line 347.

2. **Bottom Performers (lines 358-374)**: Add `if (kpi.status !== 'approved') return;` at the start of the `kpis.forEach` loop that builds `bottomEmployeeScores` (line 359). Change `.slice(0, 5)` to `.slice(0, 10)` on line 374.

### No database changes needed


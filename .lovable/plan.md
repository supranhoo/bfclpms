
# Fix: Alternate Y-Axis Category Labels Missing on All Charts

## Root Cause

Recharts' `YAxis` component has an auto-calculated `interval` property that skips tick labels when it determines there isn't enough vertical space. This causes every other category name to disappear -- the bars render correctly, but their labels are hidden.

## Fix

Add `interval={0}` to force Recharts to render every single Y-axis tick label, regardless of available space. This is safe because the dynamic height already ensures enough room (36px per category).

Two locations need the fix:

### 1. CategoryScoreChart.tsx (line 78) -- used by Dashboard, SelfReview, EmployeeScorecard, AuditScorecard, ManagementScorecard

Add `interval={0}` to the `YAxis` component.

### 2. PerformanceReport.tsx (line ~158) -- has its own inline BarChart

Add `interval={0}` to the `YAxis` component in the "Performance by Category" chart.

### 3. DOCUMENTATION.md

Add a note that all category bar charts use `interval={0}` on the Y-axis to prevent Recharts from auto-hiding labels.

## Result

All category labels will always be visible at every dashboard level (Self, Team, Audit, Management, Reports).

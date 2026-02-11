
# Fix: Category Chart Clipping on All Dashboards

## Root Cause

The "Performance by Category" horizontal bar chart uses 36px per category row. When an employee has 5+ categories, the chart needs more vertical space than the fixed-height containers provide. The bottom categories are clipped by CSS overflow.

**Already fixed** on Dashboard and UnifiedScorecard (dynamic height).
**Still broken** on 4 pages that use fixed heights (140-200px).

## Changes

Apply the same dynamic height pattern used in Dashboard.tsx and UnifiedScorecard.tsx to all 4 remaining pages:

### 1. SelfReview.tsx (line 476)

Replace `className="h-[200px]"` with `style={{ height: Math.max(180, categoryMetrics.length * 36) }}`.

### 2. EmployeeScorecard.tsx (line 514)

Replace `className="h-[140px] sm:h-[180px]"` with `style={{ height: Math.max(180, scoreData.categoryScores.length * 36) }}`.

### 3. AuditScorecard.tsx (line 546)

Replace `className="h-[140px] sm:h-[180px]"` with `style={{ height: Math.max(180, scoreData.categoryScores.length * 36) }}`.

### 4. ManagementScorecard.tsx (line 568)

Replace `className="h-[140px] sm:h-[180px]"` with `style={{ height: Math.max(180, scoreData.categoryScores.length * 36) }}`.

### 5. PerformanceReport.tsx (line ~123)

The Performance Report page also has a fixed `h-[300px]` container for its "Performance by Category" bar chart. Apply the same dynamic height: `style={{ height: Math.max(180, categoryPerformance.length * 36) }}`.

### 6. DOCUMENTATION.md

Update the chart design notes to document that all "Performance by Category" containers use dynamic height sizing.

## Result

Every dashboard level (Self, Team, Audit, Management, Unified, Reports) will dynamically grow to fit all categories -- no more hidden or clipped labels.

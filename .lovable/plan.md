
# Plan: Always Show "View KPI Details" Button Across All Review Levels

## ✅ COMPLETED

## Problem Summary

The "View" button (Eye icon) that opens the KPI Details window with `KpiReviewPanel` was not consistently available across all review levels.

## Solution Implemented

1. Updated `KpiDetailsTable.tsx` action button logic to always show View when `onView` is provided
2. Added `onView={openReviewSheet}` prop to `AuditScorecard.tsx`
3. Added `onView={openReviewSheet}` prop to `ManagementScorecard.tsx`
4. Updated `DOCUMENTATION.md` with universal View access details

## Result

| KPI Status | My KPIs | Team Review | Audit | Management |
|------------|---------|-------------|-------|------------|
| kra_set | Review | View | View | View |
| self_review | View | Review | View | View |
| manager_check | View | View | Review | View |
| audit | View | View | Continue | View |
| management_review | View | View | View | Review |
| approved | View | View | Forwarded | Completed |

All levels can now always access the "View KPI Details" window with full transparency into all 4 review stages.

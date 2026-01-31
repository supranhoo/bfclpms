
# Plan: Allow Employees to View Submitted KPIs in Read-Only Mode

## Status: ✅ COMPLETED

## Problem Summary

When an employee submits a Daily KPI for the month, the KPI status changes from `kra_set` to `self_review`. Previously:

| Status | What Employee Saw | Issue |
|--------|-------------------|-------|
| `kra_set` | "Review" button (clickable) | Works correctly |
| `self_review` | "Pending Review" badge (not clickable) | Cannot view their submissions |
| Other statuses | "Processed" badge (not clickable) | Cannot view their submissions |

**User expectation**: After submitting, employees should still be able to open the KPI sheet and view their daily submission summary in read-only mode.

## Solution Implemented

Added a "View" button alongside the status badge for all submitted KPIs, allowing employees to open the review sheet in read-only mode to see their Daily Submission Summary.

### Changes Made to `src/pages/MyKpis.tsx`

1. **Actions column**: Replaced non-clickable badges with status badge + View button (Eye icon)
2. **Sheet header**: Shows "View Submission" title with "Read Only" badge for submitted KPIs
3. **Read-only banner**: Added info banner showing current status stage
4. **Input fields**: Hidden in read-only mode (N/A checkbox, achieved value, remarks)
5. **Evidence section**: Shows read-only link instead of upload component
6. **Footer**: Only shows "Close" button in read-only mode
7. **Daily Submission Summary**: Remains visible in both modes

### Changes Made to `DOCUMENTATION.md`

Updated Section 4.7 (Self Review Workflow) to document the view-only mode feature including:
- Behavior table comparing edit vs view modes
- UI indicators for read-only state
- Benefits of the new feature

## Visual Result

**Before**:
```
| KPI Name            | Status      | Actions                |
|---------------------|-------------|------------------------|
| Share Sales Report  | Self Review | [Pending Review badge] | <-- Not clickable
```

**After**:
```
| KPI Name            | Status      | Actions                         |
|---------------------|-------------|---------------------------------|
| Share Sales Report  | Self Review | [Submitted badge] [👁 View]     | <-- View is clickable
```

## Testing Completed

- ✅ KPIs in `kra_set` status show "Review" button (editable)
- ✅ Submitted KPIs show status badge + "View" button
- ✅ Clicking View opens sheet in read-only mode
- ✅ Read-only banner displays current status
- ✅ Input fields hidden in read-only mode
- ✅ Daily Submission Summary visible in read-only mode
- ✅ "Close" button available to close sheet

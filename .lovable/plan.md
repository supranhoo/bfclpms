
# Plan: Allow Employees to View Submitted KPIs in Read-Only Mode

## Problem Summary

When an employee submits a Daily KPI for the month, the KPI status changes from `kra_set` to `self_review`. Currently:

| Status | What Employee Sees | Issue |
|--------|-------------------|-------|
| `kra_set` | "Review" button (clickable) | Works correctly |
| `self_review` | "Pending Review" badge (not clickable) | Cannot view their submissions |
| Other statuses | "Processed" badge (not clickable) | Cannot view their submissions |

**User expectation**: After submitting, employees should still be able to open the KPI sheet and view their daily submission summary in read-only mode.

## Root Cause

In `src/pages/MyKpis.tsx` (lines 851-871), the action column logic is:

```typescript
kpi.status === 'kra_set' ? (
  <Button onClick={() => openReviewDialog(kpi)}>Review</Button>  // Clickable
) : kpi.status === 'self_review' ? (
  <Badge>Pending Review</Badge>  // Not clickable!
) : (
  <Badge>Processed</Badge>  // Not clickable!
)
```

Only `kra_set` status KPIs are clickable - all other statuses show non-interactive badges.

## Solution

Add a "View" button alongside the status badge for all submitted KPIs, allowing employees to open the review sheet in read-only mode to see their Daily Submission Summary.

### Changes to `src/pages/MyKpis.tsx`

**1. Modify the Actions column (lines 851-871)**

Replace the non-clickable badges with clickable buttons that show the status and allow viewing:

```typescript
{isLocked ? (
  <Badge variant="outline" className="h-8 px-3 flex items-center gap-1 text-muted-foreground">
    <Lock className="h-3.5 w-3.5" />
    Locked
  </Badge>
) : kpi.status === 'kra_set' ? (
  <Button
    size="sm"
    variant="default"
    onClick={() => openReviewDialog(kpi)}
    className="h-8"
  >
    <FileCheck className="h-3.5 w-3.5 mr-1" />
    Review
  </Button>
) : (
  // For all submitted statuses: show status badge + View button
  <div className="flex items-center gap-1">
    <Badge 
      variant="secondary" 
      className={cn("h-7 px-2 text-xs", {
        "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200": kpi.status === 'self_review',
        "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200": kpi.status !== 'self_review',
      })}
    >
      {statusLabels[kpi.status] || 'Submitted'}
    </Badge>
    <Button
      size="sm"
      variant="outline"
      onClick={() => openReviewDialog(kpi)}
      className="h-7 px-2"
      title="View your submission"
    >
      <Eye className="h-3.5 w-3.5" />
    </Button>
  </div>
)}
```

**2. Update the Review Sheet to show read-only mode for submitted KPIs**

When the KPI is not in `kra_set` status, the review sheet should:
- Show all submission data (including Daily Submission Summary)
- Hide/disable the input fields and action buttons
- Display a "Read Only" indicator

Add logic around lines 1238-1260 to conditionally disable inputs:

```typescript
// At the top of the sheet render
const isReadOnly = selectedKpi?.status !== 'kra_set';

// Add read-only banner if applicable
{isReadOnly && (
  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4 flex items-center gap-2">
    <Eye className="h-4 w-4 text-blue-600" />
    <span className="text-sm text-blue-800">
      Viewing submitted data - This KPI is pending review
    </span>
  </div>
)}

// Disable inputs and hide action buttons when isReadOnly
{!isReadOnly && (
  // Show input fields and Save/Submit buttons
)}
```

**3. Ensure Daily Submission Summary is always visible**

Currently it only shows when `selectedKpiSubPeriods.length > 0`. This should remain unchanged as it will naturally show submissions if they exist.

## Technical Details

### Files to Modify

| File | Changes |
|------|---------|
| `src/pages/MyKpis.tsx` | Add View button for submitted KPIs, implement read-only mode in sheet |
| `DOCUMENTATION.md` | Document the view-only mode for employees |

### View-Only Sheet Behavior

| Element | `kra_set` Status | Other Statuses |
|---------|-----------------|----------------|
| Date/Week selector | Enabled | Disabled |
| Value input | Enabled | Disabled |
| Remarks input | Enabled | Disabled |
| Evidence upload | Enabled | Hidden |
| Save Entry button | Visible | Hidden |
| Submit Month button | Visible | Hidden |
| Done button | Visible | Visible (to close sheet) |
| Daily Summary table | Visible | Visible |
| Read-only banner | Hidden | Visible |

## Visual Preview

**Before (Current)**:
```
| KPI Name            | Status      | Actions                |
|---------------------|-------------|------------------------|
| Share Sales Report  | Self Review | [Pending Review badge] | <-- Not clickable
```

**After (Proposed)**:
```
| KPI Name            | Status      | Actions                         |
|---------------------|-------------|---------------------------------|
| Share Sales Report  | Self Review | [Self Review badge] [View 👁] | <-- View is clickable
```

## Testing Checklist

1. Go to My KPIs page as an employee
2. Verify KPIs in `kra_set` status show "Review" button (editable)
3. Submit a Daily KPI using "Submit Month"
4. Verify the status changes to `self_review` 
5. Verify a "View" button appears next to the status badge
6. Click View and verify the sheet opens in read-only mode
7. Verify the Daily Submission Summary table is visible
8. Verify input fields are disabled and action buttons are hidden
9. Verify the "Done" button closes the sheet

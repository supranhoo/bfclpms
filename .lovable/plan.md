
# Plan: Allow Viewing Daily Submission Summary for All KPI Statuses

## Summary

The Daily Submission Summary Table is currently only accessible via the Review Sheet, which only opens for KPIs with status `self_review`. This means managers/admins cannot view daily submission data for KPIs that are still in `kra_set` status (before employee has done their final self-review).

This plan adds the ability to view KPI details and daily submissions for ALL statuses, not just `self_review`.

## Root Cause Analysis

| Issue | Current Behavior | Expected Behavior |
|-------|------------------|-------------------|
| Review button visibility | Only shows for `self_review` status | Should allow viewing for all statuses |
| Daily Summary visibility | Only in Review Sheet | Should be accessible for any Daily KPI with submissions |

## Proposed Solution

Modify the EmployeeScorecard component to:
1. Add a "View" button for KPIs that are not in `self_review` status (like `kra_set`)
2. Show the Review Sheet in read-only mode for viewing daily submissions and KPI details
3. Only show action buttons (Save Draft, Approve, Send Back, Query) when status is `self_review`

## Files to Modify

| File | Change Type | Purpose |
|------|-------------|---------|
| `src/components/review/EmployeeScorecard.tsx` | Modify | Add View button for non-reviewable KPIs, conditional action buttons |
| `DOCUMENTATION.md` | Modify | Document the change |

## Technical Details

### EmployeeScorecard.tsx Changes

**Current Table Row (Actions column):**
```tsx
<TableCell>
  {canReview && (
    <Button size="sm" onClick={() => openReviewSheet(kpi)}>
      Review
    </Button>
  )}
</TableCell>
```

**Updated Logic:**
```tsx
const canReview = kpi.status === 'self_review' && !isNaKpi;
const canView = !canReview && kpi.frequency === 'Daily' && !isNaKpi;

<TableCell>
  {canReview && (
    <Button size="sm" onClick={() => openReviewSheet(kpi)}>
      Review
    </Button>
  )}
  {canView && (
    <Button size="sm" variant="outline" onClick={() => openReviewSheet(kpi)}>
      <Eye className="h-4 w-4 mr-1" /> View
    </Button>
  )}
</TableCell>
```

**Sheet Footer Conditional Rendering:**
```tsx
<SheetFooter className="flex-wrap gap-2 sm:justify-between">
  {selectedKpi?.status === 'self_review' ? (
    // Show all action buttons for reviewable KPIs
    <>...</>
  ) : (
    // Only show Close button for view-only mode
    <Button variant="outline" onClick={() => setReviewSheetOpen(false)}>
      Close
    </Button>
  )}
</SheetFooter>
```

**Score Input Section:**
Only show manager score input when status is `self_review`:
```tsx
{selectedKpi?.status === 'self_review' && (
  <AchievedValueScoreInput ... />
)}
```

## Visual Changes

### Before
| Status | Button | Can View Daily Summary |
|--------|--------|------------------------|
| kra_set | None | No |
| self_review | Review | Yes |
| manager_check+ | None | No |

### After
| Status | Button | Can View Daily Summary |
|--------|--------|------------------------|
| kra_set | View (for Daily KPIs) | Yes |
| self_review | Review | Yes |
| manager_check+ | View (for Daily KPIs) | Yes |

## Implementation Steps

1. Add `Eye` icon import from lucide-react
2. Add `canView` condition for non-reviewable Daily KPIs
3. Add "View" button that opens the same sheet but in view-only mode
4. Wrap action buttons in conditional to hide when viewing only
5. Wrap score input in conditional to hide when viewing only
6. Update documentation

## Testing Checklist

- Login as admin/manager
- Navigate to Team Review
- Click on user "Dummy"
- Verify "View" button appears for Daily KPIs with `kra_set` status
- Click View - verify Daily Submission Summary table is visible
- Verify action buttons are hidden in view mode
- Verify score input is hidden in view mode
- Test Review button still works for `self_review` status KPIs

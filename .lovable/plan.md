
## Summary
Remove the redundant "Raise Query" and "Send Back" action icons from the KPI table rows in the Team Review page, since these actions are already accessible inside the Review Sheet where they have better context.

## Changes Required

### File: `src/components/review/EmployeeScorecard.tsx`

**Remove from Table Actions Column (Lines 484-502)**

Currently the Actions column shows:
- Review button (keep - this opens the sheet)
- Raise Query icon button (remove - available in sheet)
- Send Back icon button (remove - available in sheet)

The table will now only show the "Review" button, which opens the full Review Sheet where all contextual actions (including Send Back and Raise Query) are available with the full KPI details visible.

## Technical Details

### Current Table Actions Structure (Lines 474-505):
```tsx
<TableCell>
  <div className="flex items-center gap-1">
    {canReview && (
      <Button size="sm" onClick={() => openReviewSheet(kpi)}>
        Review
      </Button>
    )}
    {!isLocked && !isNaKpi && (
      <>
        <Button size="sm" variant="ghost" onClick={() => openQueryDialog(kpi)}>
          <MessageSquare className="h-4 w-4" />  {/* REMOVE */}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => openSendBackDialog(kpi)}>
          <Undo2 className="h-4 w-4" />  {/* REMOVE */}
        </Button>
      </>
    )}
  </div>
</TableCell>
```

### Updated Structure:
```tsx
<TableCell>
  {canReview && (
    <Button size="sm" onClick={() => openReviewSheet(kpi)}>
      Review
    </Button>
  )}
</TableCell>
```

## Benefits

1. **Cleaner UI**: Less cluttered table with focused actions
2. **Better UX**: Users review the full KPI context before taking actions
3. **Consistency**: Actions are available in one logical place (the Review Sheet)
4. **Reduced confusion**: No duplicate paths to the same functionality

## Actions in Review Sheet (Remain Unchanged)

The Review Sheet footer (lines 585-633) will continue to provide:
- Cancel button
- Send Back button (with reason dialog)
- Raise Query button (with reason dialog)
- Save Draft button
- Approve button

## Documentation Update

Update DOCUMENTATION.md to clarify that Send Back and Raise Query actions are accessed through the Review Sheet, not directly from the table.

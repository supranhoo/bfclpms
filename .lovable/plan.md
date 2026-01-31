

# Plan: One-Time Update Limit for Sub-Period Submissions

## Summary

This plan implements a "one update only" policy for daily/weekly KPI entries:

1. After the initial submission, employee can update exactly **once**
2. After the single update is made, no further edits are allowed
3. The confirmation dialog will show a clear warning message about this limitation

## Database Changes

### Add Column to `sub_period_submissions` Table

| Column | Type | Default | Description |
|--------|------|---------|-------------|
| `is_resubmitted` | boolean | false | Set to true after the first update is made. When true, no further edits are allowed. |

## Files to Modify

| File | Change Type | Purpose |
|------|-------------|---------|
| Database Migration | Create | Add `is_resubmitted` column |
| `src/hooks/useSubPeriodSubmissions.ts` | Modify | Include `is_resubmitted` in interface and mutation |
| `src/components/review/DailySubmissionGrid.tsx` | Modify | Check `is_resubmitted` flag, update dialog message |
| `src/components/review/WeeklySubmissionTable.tsx` | Modify | Check `is_resubmitted` flag, update dialog message |
| `DOCUMENTATION.md` | Modify | Document one-update policy |

## Technical Details

### Database Migration SQL

```sql
-- Add resubmission tracking to sub-period submissions
ALTER TABLE sub_period_submissions
ADD COLUMN is_resubmitted boolean DEFAULT false;
```

### Interface Update

Add to `SubPeriodSubmission` interface:

```typescript
export interface SubPeriodSubmission {
  // ... existing fields
  is_resubmitted: boolean;  // NEW - true if entry has been updated once
}
```

### Submission Logic Update

Modify `useSubmitSubPeriod` mutation to:
- When upserting a record that already exists (update scenario), set `is_resubmitted = true`
- Check if the existing record has `is_resubmitted = true` before allowing the update

### DayEntry/WeekEntry Interface Updates

Add tracking for resubmission status:

```typescript
interface DayEntry {
  // ... existing fields
  isResubmitted: boolean;  // NEW - from submission.is_resubmitted
}
```

### UI Logic Changes

**DailySubmissionGrid.tsx & WeeklySubmissionTable.tsx:**

1. **Check if already resubmitted** - If `entry.isResubmitted === true`, hide the Edit button (entry is now locked)

2. **Status Badge Update** - Show "Final" badge instead of "Done" when `isResubmitted` is true

3. **Updated Dialog Warning Message:**
   ```
   "You can update this record only once. It will be considered final 
   and no further update will be allowed. Are you sure to re-submit?"
   ```

4. **Button Text Change** - Change "Confirm & Edit" to "Confirm & Re-submit"

### UI State Flow

| State | Badge | Action Button | Editable |
|-------|-------|---------------|----------|
| Not submitted | Pending | Enter | Yes |
| Submitted (first time) | Done | Edit | Yes (with confirmation) |
| Resubmitted (final) | Final | None | No |

### Confirmation Dialog Design

```
+----------------------------------------------------------+
|  Re-submit Data?                                          |
+----------------------------------------------------------+
|                                                           |
|  ⚠️ You can update this record only once. It will be     |
|  considered final and no further update will be allowed.  |
|                                                           |
|  Current Value: 85%                                       |
|  Submitted On: 28 Jan 2026, 10:30 AM                      |
|                                                           |
|  +----------------------------------------------------+  |
|  | Reason for Update *                                |  |
|  +----------------------------------------------------+  |
|  |                                                    |  |
|  +----------------------------------------------------+  |
|                                                           |
|  Are you sure you want to re-submit?                      |
|                                                           |
+----------------------------------------------------------+
|                    [Cancel]  [Confirm & Re-submit]        |
+----------------------------------------------------------+
```

### Save Logic Update

When saving an update:

```typescript
const handleSave = async (entry: DayEntry) => {
  await submitSubPeriod.mutateAsync({
    kpi_id: kpiId,
    sub_period_type: 'daily',
    sub_period_value: entry.date,
    achieved_value: value,
    remarks: tempRemarks || null,
    review_month: reviewMonth,
    review_year: reviewYear,
    update_reason: updateReason || null,
    is_resubmission: entry.isSubmitted,  // NEW - mark as resubmission if updating
  });
};
```

## Technical Implementation Details

### 1. Hook Update (useSubPeriodSubmissions.ts)

- Add `is_resubmitted` to `SubPeriodSubmission` interface
- Add `is_resubmission` flag to mutation parameters
- When `is_resubmission` is true, set `is_resubmitted = true` in the upsert

### 2. Grid Components Update

**Build entries with resubmission status:**

```typescript
entries.push({
  date: dateStr,
  day,
  achieved_value: submission?.achieved_value?.toString() || '',
  remarks: submission?.remarks || '',
  isSubmitted: !!submission,
  isResubmitted: submission?.is_resubmitted || false,  // NEW
  submissionId: submission?.id,
  canSubmit: availableDateValues.includes(dateStr),
  submittedAt: submission?.submitted_at || undefined,
});
```

**Disable edit for resubmitted entries:**

```typescript
// In Action column
{editingDay === entry.day ? (
  // ... edit mode buttons
) : entry.canSubmit && !entry.isResubmitted ? (  // NEW CHECK
  <Button onClick={() => handleStartEdit(entry)}>
    {entry.isSubmitted ? 'Edit' : 'Enter'}
  </Button>
) : null}
```

**Updated status badge:**

```typescript
{entry.isResubmitted ? (
  <Badge variant="default" className="bg-green-600">
    <Lock className="h-3 w-3 mr-1" />
    Final
  </Badge>
) : entry.isSubmitted ? (
  <Badge variant="secondary" className="gap-1">
    <Check className="h-3 w-3" />
    Done
  </Badge>
) : // ...
}
```

## Testing Checklist

After implementation:
- Submit a daily entry for the first time - should show "Done" status
- Click "Edit" on submitted entry - should see warning about one-time update
- Confirm update with reason - should save and show "Final" status
- Verify "Edit" button is hidden for entries with "Final" status
- Test same flow for weekly submissions
- Verify database `is_resubmitted` column is set correctly
- Verify update_reason is stored when resubmitting


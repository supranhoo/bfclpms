

# Plan: Add "Submit for Month" Option for Daily/Weekly KPIs

## Current Behavior Analysis

Currently, **Daily/Weekly KPIs have a two-step process** that can be confusing:

| Step | Current Flow | User Experience |
|------|--------------|-----------------|
| 1 | Employee enters individual daily/weekly values | Values go to `sub_period_submissions` table |
| 2 | Values are aggregated and shown as "Monthly Avg" | No explicit "Submit for Month" action |
| 3 | Footer shows "Done" button (closes dialog) | **Missing: Final submission to workflow** |

**Problem**: The employee can enter daily values, but there's no clear action to finalize and move the KPI to the manager's queue. The monthly aggregated score exists but doesn't trigger the workflow progression.

## Proposed Solution

Add an explicit **"Submit for Month"** button in the Self Review sheet for Daily/Weekly KPIs that:

1. Calculates the aggregated score from all daily/weekly entries
2. Creates/updates the `review_submissions` record with the average
3. Transitions the KPI status from `kra_set` → `self_review`
4. Moves the KPI to the manager's Team Review queue

### UI Changes

The Submit Self Review sheet footer will be enhanced:

```
Current Footer (Daily KPI):
+-------------------------------------+
| [Done]           [Save Entry]       |
+-------------------------------------+

Proposed Footer (Daily KPI):
+-------------------------------------------------------+
| [Done]  [Save Entry]  [Submit Month →] (highlighted)  |
+-------------------------------------------------------+
```

**"Submit Month" Button Behavior:**
- Shows summary: "Submit 15 daily entries with average score of 4.2?"
- Only enabled when there's at least 1 valid daily submission
- Disabled if already submitted (status ≠ kra_set)
- Triggers confirmation dialog before final submission

### Confirmation Dialog

```
+--------------------------------------------------+
| 📊 Submit Monthly Review                          |
+--------------------------------------------------+
| You are about to submit this Daily KPI for       |
| manager review.                                   |
|                                                   |
| ┌─────────────────────────────────────────────┐  |
| │ Daily Entries: 15                           │  |
| │ Average Score: 4.2                          │  |
| │ Rating: Exceeds Expectations                │  |
| └─────────────────────────────────────────────┘  |
|                                                   |
| ⚠️ Once submitted, you won't be able to          |
| modify the aggregated score.                     |
|                                                   |
|            [Cancel]  [Confirm & Submit]          |
+--------------------------------------------------+
```

## Technical Implementation

### Files to Modify

| File | Changes |
|------|---------|
| `src/pages/MyKpis.tsx` | Add "Submit for Month" button and confirmation dialog |
| `DOCUMENTATION.md` | Document the two-level submission flow |

### Code Changes (MyKpis.tsx)

**1. Add state for monthly submission confirmation:**
```typescript
const [showMonthlySubmitConfirm, setShowMonthlySubmitConfirm] = useState(false);
```

**2. Add handler for monthly submission:**
```typescript
const handleSubmitMonthlyReview = async () => {
  if (!selectedKpi || !needsSubPeriodForKpi) return;
  
  const aggregatedScore = calculateAggregatedScore(selectedKpiSubPeriods);
  if (aggregatedScore === null) return;
  
  // Calculate rating from aggregated score
  const result = calculateScoreFromAchieved(aggregatedScore, selectedKpi);
  
  // Submit to review_submissions and transition status
  await submitReview.mutateAsync({
    kpi_id: selectedKpi.id,
    achieved_value: aggregatedScore,
    self_rating: getRatingLevel(result.rating),
    self_score: result.rating,
    self_remarks: selfRemarks,
    self_evidence_url: selfEvidenceUrl,
    is_na: false,
  });
  
  setShowMonthlySubmitConfirm(false);
  setReviewDialogOpen(false);
};
```

**3. Add "Submit Month" button in SheetFooter:**
```typescript
// After existing footer buttons
{needsSubPeriodForKpi && selectedKpiSubPeriods.length > 0 && selectedKpi?.status === 'kra_set' && (
  <Button 
    size="sm"
    variant="default"
    onClick={() => setShowMonthlySubmitConfirm(true)}
    className="gap-1"
  >
    Submit Month
    <Send className="h-3 w-3" />
  </Button>
)}
```

**4. Add confirmation dialog:**
```typescript
<AlertDialog open={showMonthlySubmitConfirm} onOpenChange={setShowMonthlySubmitConfirm}>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle className="flex items-center gap-2">
        <BarChart3 className="h-5 w-5 text-primary" />
        Submit Monthly Review
      </AlertDialogTitle>
      <AlertDialogDescription asChild>
        <div className="space-y-3">
          <p>Submit this {selectedKpi?.frequency} KPI for manager review?</p>
          <div className="p-3 bg-muted rounded-lg space-y-2">
            <div className="flex justify-between">
              <span>Total Entries:</span>
              <strong>{selectedKpiSubPeriods.length}</strong>
            </div>
            <div className="flex justify-between">
              <span>Average Score:</span>
              <strong>{aggregatedSubPeriodScore?.toFixed(2)}</strong>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            Once submitted, the KPI will move to your manager's review queue.
          </p>
        </div>
      </AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel>Cancel</AlertDialogCancel>
      <AlertDialogAction onClick={handleSubmitMonthlyReview}>
        Confirm & Submit
      </AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

### Visual Workflow After Implementation

```
Daily KPI Flow:
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  Day 1 ─┬─ Entry → sub_period_submissions                   │
│  Day 2 ─┤                                                   │
│  Day 3 ─┤         (No status change)                        │
│  ...    ─┤                                                   │
│  Day N ─┘                                                   │
│                                                             │
│         ↓                                                   │
│                                                             │
│  [Submit Month] → review_submissions (avg)                  │
│                 → kpis.status = 'self_review'               │
│                 → Manager gets notified                     │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Button States

| Condition | "Submit Month" Button State |
|-----------|----------------------------|
| No daily entries yet | Hidden |
| Has entries, status = kra_set | Visible & Enabled |
| Has entries, status ≠ kra_set | Hidden (already submitted) |
| Submitting | Disabled with spinner |

### Edge Cases

1. **No entries yet**: "Submit Month" button is hidden
2. **Already submitted**: Button hidden (status check)
3. **Mixed entries with nulls**: Average calculated only from valid entries
4. **Weekly KPIs**: Same logic applies (uses weekly entries)
5. **Re-entry after submission**: Handled by existing resubmission flow

## Testing Checklist

- Create a Daily KPI and enter values for multiple days
- Verify "Submit Month" button appears after at least 1 entry
- Verify confirmation dialog shows correct entry count and average
- Submit and verify KPI moves to `self_review` status
- Verify manager sees the KPI in Team Review
- Test with Weekly KPI to confirm same behavior
- Verify button is hidden when KPI is already submitted


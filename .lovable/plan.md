
# Plan: Manager Review Enhancement for Daily Binary KPIs

## Overview

When a Manager reviews a Daily Binary KPI, they should have two options:
1. **Select "Yes"** → Accept employee's self-review score as-is and approve
2. **Select "No"** → Override daily entries for specific dates, triggering score recalculation

---

## Current State Analysis

### How Manager Review Works Now
- Manager sees a `QualitativeValueInput` component showing "Yes" / "No" buttons
- Both options are just score selections (5 or 0) that apply to the whole KPI
- There's no connection between the manager's choice and the underlying daily submission data
- The `DailySubmissionSummary` is read-only - managers cannot edit individual days

### What Needs to Change
| Current | New |
|---------|-----|
| Manager "Yes/No" = new score selection | Manager "Yes" = approve existing score |
| Manager "No" has no special behavior | Manager "No" = open date editor |
| Daily summary is read-only | Daily summary becomes editable when manager disagrees |
| Score recalculates from manager selection | Score recalculates from manager-edited daily data |

---

## Technical Implementation

### Phase 1: New Component - ManagerDailyOverrideEditor

Create a new component that allows managers to override specific daily entries when they disagree with the employee's submission.

**File: `src/components/review/ManagerDailyOverrideEditor.tsx`**

```text
┌─────────────────────────────────────────────────────────────────┐
│  Manager Override Mode                                           │
│  ─────────────────────────────────────────────────────────────── │
│                                                                   │
│  ⚠ Select dates to override                                      │
│                                                                   │
│  ┌───────────────────────────────────────────────────────────┐   │
│  │  Date       │ Current Value │ Manager Override │ Status   │   │
│  │─────────────│───────────────│──────────────────│──────────│   │
│  │  15 Jan     │ Yes           │ [  No  ▼ ]       │ Changed  │   │
│  │  16 Jan     │ Yes           │ Yes (keep)       │ —        │   │
│  │  17 Jan     │ No            │ No (keep)        │ —        │   │
│  │  18 Jan     │ (missing)     │ [  No  ▼ ]       │ Filled   │   │
│  └───────────────────────────────────────────────────────────┘   │
│                                                                   │
│  ┌─ Recalculated Score ────────────────────────────────────────┐ │
│  │  Original Score: 5 (Outstanding)                            │ │
│  │  New Score: 3 (Meets Expectations) based on overrides       │ │
│  │  Changes: 2 dates modified                                  │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                                                                   │
│  Reason for Override: *                                          │
│  [Required textarea - e.g., "Checked HRMS logs, found gaps"]     │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

**Key Features:**
- Calendar/list view showing all days of the month
- Each day shows current value and allows override selection (Yes/No/keep)
- Real-time score recalculation preview as manager makes changes
- Mandatory reason field for audit trail
- Bulk actions: "Mark all missing as No", "Reset overrides"

### Phase 2: New Hook - useManagerSubPeriodOverride

**File: `src/hooks/useManagerSubPeriodOverride.ts`**

This hook handles manager overrides of daily data:
- Creates/updates entries in `sub_period_submissions` with manager attribution
- Stores original values for audit trail
- Creates audit log entries with `MANAGER_DAILY_OVERRIDE` action
- Recalculates aggregated score after changes

```typescript
export interface ManagerOverrideParams {
  kpi_id: string;
  employee_id: string;
  overrides: Array<{
    sub_period_value: string;  // Date string
    achieved_value: number;    // New value (0 or 5 for binary)
    original_value: number | null;  // Previous value for audit
  }>;
  reason: string;
  review_month: string;
  review_year: number;
}

export function useManagerSubPeriodOverride() {
  // Implementation:
  // 1. Batch update sub_period_submissions
  // 2. Mark entries as "manager_overridden" (new column or metadata)
  // 3. Create audit log with full diff
  // 4. Recalculate aggregated score
  // 5. Update review_submissions.manager_achieved_value with new aggregate
}
```

### Phase 3: Update EmployeeScorecard Review Sheet

**File: `src/components/review/EmployeeScorecard.tsx`**

Modify the review sheet for Daily Binary KPIs:

**Current Flow:**
```
KPI Details → Rating Scale → Review Trail → Daily Summary (read-only) → Manager Score Input → Actions
```

**New Flow:**
```
KPI Details → Rating Scale → Review Trail → Daily Summary (read-only) 
→ Manager Agreement Toggle → [If "No": ManagerDailyOverrideEditor] 
→ Calculated Score Display → Actions
```

**State Changes:**
```typescript
// Add new state for agreement tracking
const [managerAgrees, setManagerAgrees] = useState<boolean | null>(null);
const [overrides, setOverrides] = useState<Map<string, number>>(new Map());
const [overrideReason, setOverrideReason] = useState('');
```

**UI Changes for Binary Daily KPIs:**

```tsx
{isDailyBinaryKpi && selectedKpi.status === 'self_review' && (
  <div className="space-y-4">
    {/* Agreement Toggle */}
    <div className="space-y-2">
      <Label>Do you agree with the employee's daily submissions?</Label>
      <div className="flex gap-2">
        <Button
          variant={managerAgrees === true ? 'default' : 'outline'}
          onClick={() => handleAgreeSelection(true)}
          className={managerAgrees === true ? 'bg-green-600 hover:bg-green-700' : ''}
        >
          <Check className="h-4 w-4 mr-2" />
          Yes - Accept Score
        </Button>
        <Button
          variant={managerAgrees === false ? 'default' : 'outline'}
          onClick={() => handleAgreeSelection(false)}
          className={managerAgrees === false ? 'bg-amber-600 hover:bg-amber-700' : ''}
        >
          <Edit2 className="h-4 w-4 mr-2" />
          No - Override Entries
        </Button>
      </div>
    </div>
    
    {/* Show override editor when manager disagrees */}
    {managerAgrees === false && (
      <ManagerDailyOverrideEditor
        kpiId={selectedKpi.id}
        employeeId={employee.id}
        reviewMonth={selectedPeriod}
        reviewYear={selectedYear}
        submissions={submissions}  // Current daily data
        overrides={overrides}
        onOverridesChange={setOverrides}
        overrideReason={overrideReason}
        onReasonChange={setOverrideReason}
      />
    )}
    
    {/* Score display (recalculated if overrides exist) */}
    <div className="p-4 bg-muted rounded-lg">
      <div className="flex justify-between items-center">
        <span className="font-medium">
          {managerAgrees === false ? 'Recalculated Score' : 'Employee Score'}
        </span>
        <Badge className={getScoreColor(calculatedScore)}>
          {calculatedScore} - {getScoreLabel(calculatedScore)}
        </Badge>
      </div>
    </div>
  </div>
)}
```

### Phase 4: Score Recalculation Logic

When manager makes overrides, recalculate in real-time:

```typescript
const calculatedScore = useMemo(() => {
  if (managerAgrees === true || !isDailyBinaryKpi) {
    // Use employee's submitted score
    return submissionMap.get(selectedKpi.id)?.self_score || null;
  }
  
  if (managerAgrees === false) {
    // Apply overrides and recalculate
    const monthData = getMonthlyData(submissions, overrides);
    const result = calculateBinaryDailyScore(
      monthData.values,
      selectedPeriod,
      selectedYear
    );
    return result.score;
  }
  
  return null;
}, [managerAgrees, submissions, overrides, selectedPeriod, selectedYear]);
```

### Phase 5: Update Approval Flow

Modify `handleApprove` to handle the override case:

```typescript
const handleApprove = async () => {
  if (!selectedKpi) return;
  
  const isDailyBinary = selectedKpi.frequency === 'Daily' && selectedKpi.uom_type === 'binary';
  
  if (isDailyBinary && managerAgrees === false) {
    // 1. Save manager overrides to sub_period_submissions
    await saveManagerOverrides({
      kpi_id: selectedKpi.id,
      employee_id: employee.id,
      overrides: Array.from(overrides.entries()).map(([date, value]) => ({
        sub_period_value: date,
        achieved_value: value,
        original_value: getOriginalValue(date),
      })),
      reason: overrideReason,
      review_month: selectedPeriod,
      review_year: selectedYear,
    });
  }
  
  // 2. Approve with the (potentially recalculated) score
  approveKpi.mutate({
    kpi_id: selectedKpi.id,
    manager_rating: scoreToRating(calculatedScore),
    manager_score: calculatedScore,
    manager_remarks: managerRemarks,
    manager_evidence_url: managerEvidenceUrl,
  });
};
```

### Phase 6: Audit Trail Integration

Every manager override creates an audit log entry:

```json
{
  "action": "MANAGER_DAILY_OVERRIDE",
  "performed_by": "manager-uuid",
  "kpi_id": "kpi-uuid",
  "metadata": {
    "reason": "Checked HRMS logs, employee was absent on 15th",
    "original_score": 5,
    "new_score": 4,
    "overrides": [
      {"date": "2026-01-15", "from": 5, "to": 0},
      {"date": "2026-01-18", "from": null, "to": 0}
    ]
  }
}
```

### Phase 7: Visual Updates to DailySubmissionSummary

After manager override, the summary should show:
- Original employee value with strikethrough
- Manager's override value highlighted
- Visual indicator that entry was modified by manager

---

## Files to Create

| File | Purpose |
|------|---------|
| `src/components/review/ManagerDailyOverrideEditor.tsx` | Calendar-based editor for manager to override daily entries |
| `src/hooks/useManagerSubPeriodOverride.ts` | Hook to save manager overrides with audit trail |

## Files to Modify

| File | Changes |
|------|---------|
| `src/components/review/EmployeeScorecard.tsx` | Add agreement toggle + override editor integration |
| `src/components/review/DailySubmissionSummary.tsx` | Show manager overrides with visual diff |
| `src/lib/dailyAggregation.ts` | Add helper to apply overrides before calculation |
| `DOCUMENTATION.md` | Document manager override workflow for daily binary KPIs |

---

## Database Considerations

The current schema already supports what we need:
- `sub_period_submissions.update_reason` - Can store manager override reason
- `sub_period_submissions.is_resubmitted` - Can track locked entries
- `kpi_audit_logs` - Supports full audit trail with `on_behalf_of` column

Optional enhancement: Add `overridden_by` column to `sub_period_submissions` to distinguish employee vs manager entries.

---

## UI/UX Flow Summary

```text
1. Manager opens Daily Binary KPI for review
2. Sees employee's daily submission summary (read-only)
3. Presented with choice:
   ┌─────────────────────────────────────┐
   │  Do you agree with these entries?  │
   │                                     │
   │  [✓ Yes - Accept]  [✎ No - Override]│
   └─────────────────────────────────────┘

4a. If "Yes":
    - Manager's score = Employee's score
    - Click Approve → Done

4b. If "No":
    - Override editor expands
    - Manager can change specific dates from Yes→No or No→Yes
    - Real-time score recalculation shown
    - Must enter reason
    - Daily summary updates to reflect changes
    - Click Approve → Overrides saved, audit logged, KPI approved
```

---

## Testing Checklist

1. **Agreement Flow**
   - [ ] Selecting "Yes" keeps employee's score unchanged
   - [ ] Selecting "No" shows override editor

2. **Override Editor**
   - [ ] Shows all days of the month
   - [ ] Can change Yes → No and vice versa
   - [ ] Score recalculates in real-time
   - [ ] Reason is mandatory

3. **Score Recalculation**
   - [ ] 0 overrides to "No" = Score 5
   - [ ] 2 overrides to "No" = Score 3
   - [ ] Filling missing days as "No" counts in Total No

4. **Audit Trail**
   - [ ] Override action logged with full diff
   - [ ] Reason captured in metadata

5. **UI Updates**
   - [ ] Daily summary shows overrides visually
   - [ ] Overridden values highlighted

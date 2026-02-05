
# Plan: Fix Missing Historical Achieved Values in Review Journey

## Problem Summary

The Review Journey shows ratings for Manager (5), Auditor (4), and Management (3), but does NOT display their achieved values ("Value: X") like the Self stage does.

### Database Evidence
```
KPI Status: approved
| Field                     | Value |
|---------------------------|-------|
| achieved_value (Self)     | 15    |
| manager_achieved_value    | NULL  |
| auditor_achieved_value    | NULL  |
| management_achieved_value | NULL  |
```

The achieved values for Manager, Auditor, and Management are `NULL` because they were submitted BEFORE we implemented the fix to save those fields. Our recent code changes will only work for future submissions.

---

## Root Cause Analysis

| Component | Status |
|-----------|--------|
| Code to SAVE achieved values | ✅ Fixed in previous update |
| Historical data migration | ❌ Not done |
| Display logic in ReviewStageCard | ✅ Working correctly |

The display logic is correct - it only shows "Value: X" when `achievedValue` is not null. The problem is the data itself.

---

## Solution Options

### Option A: Update Historical Data (Recommended)
For this specific KPI (and similar ones), update the database to populate the missing achieved values with the employee's submitted value (since reviewers typically agree with it):

```sql
UPDATE review_submissions
SET 
  manager_achieved_value = achieved_value,
  auditor_achieved_value = achieved_value,
  management_achieved_value = achieved_value
WHERE 
  kpi_id = '5d490f4c-0a18-41c2-a684-9814b46e023f'
  AND achieved_value IS NOT NULL;
```

### Option B: Display Fallback Value
Modify the `KpiJourneySection` component to show the employee's achieved value for all stages if the stage-specific value is null but the stage has been completed.

This approach shows transparency - "Value: 15 (inherited)" - indicating the value wasn't changed.

---

## Recommended: Option A + Option B Combined

1. **Backfill historical data** - Update existing records where stage scores exist but achieved values are null
2. **Add fallback display logic** - For future edge cases where data might be missing

---

## Implementation Plan

### Step 1: Data Migration
Run a SQL update to backfill missing achieved values for all completed reviews:

```sql
-- Backfill manager_achieved_value where manager reviewed but value not saved
UPDATE review_submissions
SET manager_achieved_value = achieved_value
WHERE manager_score IS NOT NULL
  AND manager_achieved_value IS NULL
  AND achieved_value IS NOT NULL;

-- Backfill auditor_achieved_value where auditor reviewed but value not saved
UPDATE review_submissions
SET auditor_achieved_value = achieved_value
WHERE auditor_score IS NOT NULL
  AND auditor_achieved_value IS NULL
  AND achieved_value IS NOT NULL;

-- Backfill management_achieved_value where management reviewed but value not saved
UPDATE review_submissions
SET management_achieved_value = achieved_value
WHERE management_score IS NOT NULL
  AND management_achieved_value IS NULL
  AND achieved_value IS NOT NULL;
```

### Step 2: Update Display Logic (Optional Safety Net)
Modify `KpiJourneySection.tsx` to show inherited value when stage-specific value is null but stage is completed:

```typescript
// In stageData for manager:
achievedValue: submission?.manager_achieved_value 
  ?? (submission?.manager_score ? submission?.achieved_value : null),
```

This shows the employee's achieved value if:
- Manager didn't save their own value AND
- Manager DID submit a score (stage is complete)

---

## Files to Modify

| File | Change |
|------|--------|
| Database (via insert tool) | Backfill historical achieved values |
| `src/components/review/KpiJourneySection.tsx` | Add fallback logic for inherited values |
| `DOCUMENTATION.md` | Document the data migration |

---

## Visual Result After Fix

### Before
```
┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐
│    Self     │ │   Manager   │ │   Auditor   │ │ Management  │
│  Value: 15  │ │  Rating: 5  │ │  Rating: 4  │ │  Rating: 3  │
│  Rating: 0  │ │ No remarks  │ │ No remarks  │ │ No remarks  │
└─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘
```

### After
```
┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐
│    Self     │ │   Manager   │ │   Auditor   │ │ Management  │
│  Value: 15  │ │  Value: 15  │ │  Value: 15  │ │  Value: 15  │
│  Rating: 0  │ │  Rating: 5  │ │  Rating: 4  │ │  Rating: 3  │
└─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘
```

---

## Validation Checklist

After implementation:
- [ ] Historical KPIs show achieved values for all completed stages
- [ ] New submissions continue to save achieved values correctly
- [ ] N/A KPIs still work correctly (no value shown)
- [ ] Pending stages don't show inherited values

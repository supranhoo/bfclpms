
# Plan: Fix Missing Historical Achieved Values in Review Journey

## Status: ✅ COMPLETED

## Problem Summary

The Review Journey shows ratings for Manager (5), Auditor (4), and Management (3), but does NOT display their achieved values ("Value: X") like the Self stage does.

### Database Evidence (Before Fix)
```
KPI Status: approved
| Field                     | Value |
|---------------------------|-------|
| achieved_value (Self)     | 15    |
| manager_achieved_value    | NULL  |
| auditor_achieved_value    | NULL  |
| management_achieved_value | NULL  |
```

---

## Solution Implemented

### Step 1: Data Migration ✅
Ran SQL to backfill historical achieved values:
```sql
UPDATE review_submissions SET manager_achieved_value = achieved_value
WHERE manager_score IS NOT NULL AND manager_achieved_value IS NULL AND achieved_value IS NOT NULL;

UPDATE review_submissions SET auditor_achieved_value = achieved_value
WHERE auditor_score IS NOT NULL AND auditor_achieved_value IS NULL AND achieved_value IS NOT NULL;

UPDATE review_submissions SET management_achieved_value = achieved_value
WHERE management_score IS NOT NULL AND management_achieved_value IS NULL AND achieved_value IS NOT NULL;
```

### Step 2: UI Fallback Logic ✅
Updated `KpiJourneySection.tsx` to inherit employee's achieved value if stage-specific value is missing but stage is completed:
```typescript
achievedValue: submission?.manager_achieved_value 
  ?? (submission?.manager_score ? submission?.achieved_value : null),
```

---

## Visual Result After Fix

```
┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐
│    Self     │ │   Manager   │ │   Auditor   │ │ Management  │
│  Value: 15  │ │  Value: 15  │ │  Value: 15  │ │  Value: 15  │
│  Rating: 0  │ │  Rating: 5  │ │  Rating: 4  │ │  Rating: 3  │
└─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘
```

---

## Validation Checklist

- [x] Historical KPIs show achieved values for all completed stages
- [x] New submissions continue to save achieved values correctly
- [x] N/A KPIs still work correctly (no value shown)
- [x] Pending stages don't show inherited values

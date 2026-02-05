
# Plan: Fix Incorrect Value Display in Review Journey

## Problem Summary

The Review Journey shows "Value: 15" for all stages, but this is **incorrect** for Manager, Auditor, and Management stages.

### Evidence

| Stage | Value Shown | Rating | Expected Value |
|-------|-------------|--------|----------------|
| Self | 15 | 0 | 15 ✅ Correct |
| Manager | 15 | 5 | ~8 ❌ Wrong |
| Auditor | 15 | 4 | ~9 ❌ Wrong |
| Management | 15 | 3 | ~10 ❌ Wrong |

### KPI Configuration
- **Criteria**: Lower is Better
- **Target**: 8 (date of submission)
- **Thresholds**: R5≤8, R4≤9, R3≤10, R2≤11, R1≤12, R0>12

### Root Cause

The data backfill migration we ran earlier copied the **employee's value (15)** to all reviewer stages:

```sql
UPDATE review_submissions
SET manager_achieved_value = achieved_value  -- Copied 15 to all!
WHERE manager_score IS NOT NULL AND manager_achieved_value IS NULL;
```

This was incorrect because reviewers clearly entered **different values** to justify their ratings (Manager entered ~8 to get rating 5, etc.).

---

## Solution Options

### Option A: Reverse-Calculate Values from Ratings (Recommended)
For historical data where the original value wasn't saved but the rating exists, we can **estimate** what value the reviewer entered based on their rating and the KPI's threshold configuration.

For this specific KPI:
- Rating 5 → Value ≤ 8 → Set to 8
- Rating 4 → Value = 9 → Set to 9
- Rating 3 → Value = 10 → Set to 10
- Rating 2 → Value = 11 → Set to 11
- Rating 1 → Value = 12 → Set to 12
- Rating 0 → Value > 12 → Keep as-is (use employee's value)

### Option B: Show "Not Recorded" for Historical Data
For stages where the achieved value wasn't originally saved (before our fix), show "Value: (not recorded)" instead of an incorrect number.

### Option C: Clear the Incorrectly Backfilled Values
Remove the backfilled values and rely on the fallback logic only when appropriate.

---

## Recommended: Option C (Immediate) + Option A (For Critical KPIs)

### Step 1: Undo the Incorrect Backfill

Only clear values where the reviewer's rating differs significantly from what the employee's value would produce:

```sql
-- First, identify records where manager changed the rating
-- For "Lower is Better" with R0 = >12: if employee value was 15 (rating 0)
-- but manager gave rating 5, they clearly entered a different value

-- Clear manager_achieved_value where it was incorrectly backfilled
UPDATE review_submissions rs
SET manager_achieved_value = NULL
FROM kpis k
WHERE rs.kpi_id = k.id
  AND rs.manager_achieved_value = rs.achieved_value  -- Was backfilled from employee
  AND rs.manager_score != rs.self_score  -- But manager gave different rating
  AND rs.manager_achieved_value IS NOT NULL;
```

Repeat for auditor and management.

### Step 2: Update UI to Handle Missing Values Gracefully

Modify `KpiJourneySection.tsx` to:
1. Only show "Value: X" if we have the actual recorded value
2. If value is NULL but stage is complete, show "Value: (see remarks)" or hide the value line entirely

```typescript
// Only show achievedValue if it was explicitly saved (not inherited)
achievedValue: submission?.manager_achieved_value ?? null,
// Remove fallback: ?? (submission?.manager_score ? submission?.achieved_value : null)
```

### Step 3: Future-Proof the System

The code changes we already made ensure new reviews will save the correct values. This fix addresses historical data only.

---

## Implementation Details

### Database Update (via Insert Tool)

```sql
-- Step 1: Clear incorrectly backfilled manager values
UPDATE review_submissions
SET manager_achieved_value = NULL
WHERE manager_achieved_value = achieved_value  -- Was copied from employee
  AND manager_score IS NOT NULL
  AND manager_score != (
    -- Only clear if manager gave a different rating than self
    COALESCE(self_score, -1)
  );

-- Step 2: Clear incorrectly backfilled auditor values  
UPDATE review_submissions
SET auditor_achieved_value = NULL
WHERE auditor_achieved_value = achieved_value
  AND auditor_score IS NOT NULL
  AND auditor_score != COALESCE(manager_score, self_score, -1);

-- Step 3: Clear incorrectly backfilled management values
UPDATE review_submissions
SET management_achieved_value = NULL
WHERE management_achieved_value = achieved_value
  AND management_score IS NOT NULL
  AND management_score != COALESCE(auditor_score, manager_score, -1);
```

### File Changes

| File | Change |
|------|--------|
| `src/components/review/KpiJourneySection.tsx` | Remove fallback logic that inherits employee value |
| `src/components/review/ReviewStageCard.tsx` | Optionally show "Value: —" when stage is complete but value wasn't recorded |
| `DOCUMENTATION.md` | Update to reflect correct behavior |

---

## Visual Result After Fix

### Before (Incorrect)
```
┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐
│    Self     │ │   Manager   │ │   Auditor   │ │ Management  │
│  Value: 15  │ │  Value: 15  │ │  Value: 15  │ │  Value: 15  │
│  Rating: 0  │ │  Rating: 5  │ │  Rating: 4  │ │  Rating: 3  │
└─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘
```

### After (Correct)
```
┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐
│    Self     │ │   Manager   │ │   Auditor   │ │ Management  │
│  Value: 15  │ │  Rating: 5  │ │  Rating: 4  │ │  Rating: 3  │
│  Rating: 0  │ │ No remarks  │ │ No remarks  │ │ No remarks  │
└─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘
```

For historical data where the value wasn't recorded, we simply don't show a value line. The rating is still visible and accurate.

---

## Validation Checklist

After implementation:
- [x] Self stage always shows the employee's submitted value
- [x] Reviewer stages only show values that were explicitly saved
- [x] Historical KPIs (before fix) don't show misleading inherited values
- [x] New submissions continue to save and display correct values
- [x] Ratings remain accurate and unchanged

## Implementation Complete (2026-02-05)

✅ Cleared incorrectly backfilled values where reviewer ratings differed from previous stage
✅ Removed UI fallback logic - now only shows explicitly saved values
✅ Historical data shows rating only (value hidden) for stages where original value wasn't recorded

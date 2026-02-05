

# Plan: Complete Date UOM Integration in MyKpis.tsx (Self Review)

## Issue

The Date UOM feature is partially implemented:
- ✅ `calculateDateRating()` function exists in `ratingCalculation.ts`
- ✅ `DateCalendarInput` component exists
- ✅ Manager/Auditor/Management scorecards integrated
- ❌ **MyKpis.tsx (Self Review) is missing the integration**

This means employees currently see a generic numeric input for Date UOM KPIs instead of the calendar picker.

---

## Root Cause

**File**: `src/pages/MyKpis.tsx`

### Problem 1: Missing UOM Parameter in Rating Calculation (Line 293)
```typescript
// Current - missing uom parameter
return calculateRating(achieved, kpi.target_value, thresholds, kpi.criteria || 'Higher is Better', kpi.weightage || 0);
```

This causes Date UOM KPIs to use percentage-based logic instead of day-of-month comparison.

### Problem 2: Missing Calendar Input Branch (Lines 941-987)
Current input logic only has two branches:
1. Qualitative KPIs → `QualitativeValueInput`
2. Everything else → Numeric `Input`

Missing: Date UOM → `DateCalendarInput`

---

## Solution

### Change 1: Pass UOM to calculateRating()

**File**: `src/pages/MyKpis.tsx` (Line 293)

Update `calculateScoreFromAchieved` function:

```typescript
// Add uom_type and uom parameters
return calculateRating(
  achieved, 
  kpi.target_value, 
  thresholds, 
  kpi.criteria || 'Higher is Better', 
  kpi.weightage || 0,
  uomType,                          // Already exists
  kpi.qualitative_options as any,   // Already exists
  kpi.uom                           // NEW - Add this
);
```

### Change 2: Add DateCalendarInput Component

**File**: `src/pages/MyKpis.tsx` (Around line 940)

Add import at top of file:
```typescript
import { DateCalendarInput } from '@/components/review/DateCalendarInput';
```

Update the achieved value input section with three branches:

```typescript
{/* Achieved Value */}
{!isNa && (
  <div className="space-y-2">
    {selectedKpi?.uom === 'Date' ? (
      // DATE UOM - Calendar picker
      <DateCalendarInput
        value={achievedValue ? parseInt(achievedValue) : null}
        onChange={(day) => handleAchievedChange(day?.toString() || '')}
        reviewMonth={selectedPeriod}
        reviewYear={selectedYear}
        disabled={hasOrgData}
        label="Completion Date *"
      />
    ) : isQualitativeKpi(selectedKpi) ? (
      // QUALITATIVE - Binary/Tiered selector
      <QualitativeValueInput ... />
    ) : (
      // NUMERIC - Standard number input
      <>
        <Label>Achieved Value *</Label>
        <Input type="number" ... />
      </>
    )}
    
    {/* Calculated Rating Display */}
    ...
  </div>
)}
```

---

## File Changes Summary

| File | Change | Lines |
|------|--------|-------|
| `src/pages/MyKpis.tsx` | Add import for `DateCalendarInput` | Top of file |
| `src/pages/MyKpis.tsx` | Pass `kpi.uom` to `calculateRating()` | ~Line 293 |
| `src/pages/MyKpis.tsx` | Add Date UOM branch in input rendering | ~Lines 940-950 |

---

## Expected Behavior After Fix

### For Date UOM KPIs in Self Review:
1. Employee opens KPI with UOM = "Date"
2. Sees calendar picker instead of numeric input
3. Calendar restricted to review month (e.g., February 2026)
4. Selects date (e.g., 8th)
5. Achieved value stored as "8"
6. Rating calculated using day-of-month logic:
   - If R5=5 and achieved=8 → Rating 4 (since 8 > 5 but ≤ R4 threshold)

### User Flow Diagram

```text
Employee selects Date UOM KPI
        ↓
Calendar picker appears (Feb 2026 only)
        ↓
Clicks on day 8
        ↓
achievedValue = "8"
        ↓
calculateScoreFromAchieved(8, kpi)
        ↓
calculateRating(..., uom="Date")
        ↓
calculateDateRating(8, thresholds, weightage)
        ↓
8 ≤ R4(10) → Rating 4
```

---

## Validation Checklist

After implementation:
- [ ] Date UOM KPIs show calendar picker in self-review sheet
- [ ] Calendar restricted to review month only
- [ ] Selecting a date updates the achieved value
- [ ] Rating auto-calculates using day thresholds
- [ ] Org-level Date KPIs still work (value from org_kpi_values)
- [ ] Daily/Weekly Date UOM KPIs work with sub-period selector
- [ ] Non-Date UOM KPIs continue working as before


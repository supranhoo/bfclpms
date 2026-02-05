
# Plan: Date UOM Support with Calendar Selection

## Overview

This plan addresses three related features for KPIs with "Date" as the Unit of Measure (UOM):

1. **Date-based rating calculations** - Use thresholds as target dates for R5-R0 ratings
2. **Dynamic achieved value range** - Limit numeric input to month days (1-31)
3. **Calendar date picker** - Add visual calendar for date selection across all review levels

---

## Current State Analysis

| Component | Current Behavior | Gap |
|-----------|------------------|-----|
| `ratingCalculation.ts` | Treats all values as numbers | No date comparison logic |
| Achieved Value Input | Generic numeric input | No day-of-month limit or calendar |
| UOM "Date" | Listed in constants | Not handled differently |
| Review interfaces | All use numeric inputs | No date picker option |

---

## Feature 1: Date-Based Rating Calculations

### Problem
When UOM is "Date", thresholds like R5=5, R4=10, R3=15 should mean:
- Submit by 5th = Rating 5
- Submit by 10th = Rating 4
- etc.

Currently, the system treats these as numeric percentages.

### Solution
Add a special case in `calculateRating()` for Date UOM that:
1. Detects when UOM is "Date" (passed as new parameter)
2. Treats thresholds as day-of-month values
3. Uses "Lower is Better" logic (earlier date = better score)

**File**: `src/lib/ratingCalculation.ts`

```typescript
// New signature adds uom parameter
export function calculateRating(
  achievedValue: number | string | null | undefined,
  target: number | null | undefined,
  thresholds: RatingThresholds,
  criteria: string = 'Higher is Better',
  weightage: number = 0,
  uomType: UomType = 'numeric',
  qualitativeOptions?: QualitativeOption[] | null,
  uom?: string | null  // NEW: "Date", "%", "Number", etc.
): RatingResult {
  // Date UOM handling - compare day values directly
  if (uom === 'Date') {
    return calculateDateRating(achievedValue, thresholds, weightage);
  }
  // ... existing logic
}

function calculateDateRating(
  achievedValue: number | string | null | undefined,
  thresholds: RatingThresholds,
  weightage: number
): RatingResult {
  // Parse achieved as day-of-month (1-31)
  const achieved = typeof achievedValue === 'number' 
    ? achievedValue 
    : parseFloat(String(achievedValue));
    
  if (isNaN(achieved) || achieved < 1 || achieved > 31) {
    return { rating: 0, ratingLevel: 'red', weightedScore: 0, percentage: 0, achievedWeight: 0 };
  }

  // Parse thresholds as absolute day values (not ratios)
  const r5 = parseThreshold(thresholds.r5, false);
  const r4 = parseThreshold(thresholds.r4, false);
  const r3 = parseThreshold(thresholds.r3, false);
  const r2 = parseThreshold(thresholds.r2, false);
  const r1 = parseThreshold(thresholds.r1, false);

  // Lower is Better for dates (earlier = higher rating)
  let rating = 0;
  if (r5 !== null && achieved <= r5) rating = 5;
  else if (r4 !== null && achieved <= r4) rating = 4;
  else if (r3 !== null && achieved <= r3) rating = 3;
  else if (r2 !== null && achieved <= r2) rating = 2;
  else if (r1 !== null && achieved <= r1) rating = 1;

  return {
    rating,
    ratingLevel: ratingToLevel(rating),
    weightedScore: weightage * rating,
    percentage: 0,  // Not applicable for dates
    achievedWeight: 0,
  };
}
```

---

## Feature 2: Achieved Value Input Limited to Month Days

### Problem
For Date UOM, the achieved value should be a day of the month (1-31 max, or dynamically based on selected month).

### Solution
Create a `DateDayInput` component that:
1. Limits input range to 1-31 (or month's actual days)
2. Shows validation feedback
3. Used in self-review and all review levels

**New File**: `src/components/review/DateValueInput.tsx`

```typescript
interface DateValueInputProps {
  value: number | null;
  onChange: (day: number | null) => void;
  maxDays?: number;  // Defaults to 31, can be month-specific
  disabled?: boolean;
  label?: string;
}

export function DateValueInput({
  value,
  onChange,
  maxDays = 31,
  disabled = false,
  label = 'Date (Day of Month)',
}: DateValueInputProps) {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value);
    if (isNaN(val)) {
      onChange(null);
    } else if (val >= 1 && val <= maxDays) {
      onChange(val);
    }
  };

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Input
        type="number"
        min={1}
        max={maxDays}
        value={value || ''}
        onChange={handleChange}
        placeholder={`1-${maxDays}`}
        disabled={disabled}
      />
      <p className="text-xs text-muted-foreground">
        Enter day of month (1-{maxDays})
      </p>
    </div>
  );
}
```

---

## Feature 3: Calendar Date Picker for All Review Levels

### Problem
Users want to select dates visually via a calendar picker instead of typing numbers.

### Solution
Create a `DateCalendarInput` component that:
1. Shows a calendar popover restricted to the review month
2. Returns the day-of-month as the achieved value
3. Works at all review levels (Self, Manager, Auditor, Management)

**New File**: `src/components/review/DateCalendarInput.tsx`

```typescript
interface DateCalendarInputProps {
  value: number | null;
  onChange: (day: number | null) => void;
  reviewMonth: string;  // "January", "February", etc.
  reviewYear: number;
  disabled?: boolean;
  label?: string;
}

export function DateCalendarInput({
  value,
  onChange,
  reviewMonth,
  reviewYear,
  disabled = false,
  label = 'Select Date',
}: DateCalendarInputProps) {
  const [open, setOpen] = useState(false);
  
  // Build Date object from stored day value
  const monthIndex = MONTHS.indexOf(reviewMonth);
  const currentDate = value 
    ? new Date(reviewYear, monthIndex, value)
    : undefined;
  
  // Restrict calendar to review month only
  const monthStart = new Date(reviewYear, monthIndex, 1);
  const monthEnd = new Date(reviewYear, monthIndex + 1, 0);
  
  const handleSelect = (date: Date | undefined) => {
    if (date) {
      onChange(date.getDate());
    }
    setOpen(false);
  };

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className="w-full justify-start text-left font-normal"
            disabled={disabled}
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            {currentDate 
              ? format(currentDate, 'dd MMM yyyy')
              : 'Pick a date'}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={currentDate}
            onSelect={handleSelect}
            defaultMonth={monthStart}
            fromDate={monthStart}
            toDate={monthEnd}
            className="pointer-events-auto"
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}
```

### Integration Points

Update these files to use the new calendar component when `uom === 'Date'`:

| File | Component/Section | Change |
|------|-------------------|--------|
| `src/pages/MyKpis.tsx` | Self Review Sheet | Conditionally render `DateCalendarInput` |
| `src/components/review/EmployeeScorecard.tsx` | Manager Review | Add calendar for date UOM |
| `src/components/review/AuditScorecard.tsx` | Auditor Review | Add calendar for date UOM |
| `src/components/review/ManagementScorecard.tsx` | Management Review | Add calendar for date UOM |
| `src/components/review/AchievedValueScoreInput.tsx` | Generic input | Add date UOM branch |

---

## Technical Implementation

### Step 1: Update Rating Calculation
- Add `uom` parameter to `calculateRating()` function
- Add `calculateDateRating()` helper for date-specific logic
- Update all callers to pass UOM

### Step 2: Create Date Input Components
- Create `DateCalendarInput.tsx` with calendar popover
- Create `DateValueInput.tsx` as numeric fallback
- Both return day-of-month as number

### Step 3: Update Self Review (MyKpis.tsx)
```typescript
// In the achieved value input section
{selectedKpi?.uom === 'Date' ? (
  <DateCalendarInput
    value={achievedValue ? parseInt(achievedValue) : null}
    onChange={(day) => handleAchievedChange(day?.toString() || '')}
    reviewMonth={selectedPeriod}
    reviewYear={selectedYear}
    disabled={hasOrgData}
    label="Completion Date"
  />
) : isQualitativeKpi(selectedKpi) ? (
  // ... existing qualitative input
) : (
  // ... existing numeric input
)}
```

### Step 4: Update Manager Review
Similar conditional rendering in `EmployeeScorecard.tsx` for manager score override.

### Step 5: Update Auditor/Management Reviews
Same pattern for `AuditScorecard.tsx` and `ManagementScorecard.tsx`.

### Step 6: Update Score Calculation Callers
All places that call `calculateRating()` need to pass the UOM:
- `MyKpis.tsx` - `calculateScoreFromAchieved()`
- `AchievedValueScoreInput.tsx` - `calculateScoreFromValue()`
- `ScoringSimulatorPopover.tsx` - result calculation

---

## File Changes Summary

| File | Change Type | Description |
|------|-------------|-------------|
| `src/lib/ratingCalculation.ts` | Modify | Add date UOM handling with `calculateDateRating()` |
| `src/components/review/DateCalendarInput.tsx` | Create | Calendar picker for date selection |
| `src/components/review/DateValueInput.tsx` | Create | Numeric input with 1-31 validation |
| `src/pages/MyKpis.tsx` | Modify | Use calendar for Date UOM self-review |
| `src/components/review/AchievedValueScoreInput.tsx` | Modify | Add date UOM branch |
| `src/components/review/EmployeeScorecard.tsx` | Modify | Calendar for manager override |
| `src/components/admin/ScoringSimulatorPopover.tsx` | Modify | Pass UOM to calculation |
| `src/lib/ratingCalculation.test.ts` | Modify | Add tests for date rating logic |
| `DOCUMENTATION.md` | Modify | Document date UOM behavior |

---

## User Experience

### Admin Setup
When creating a KPI with UOM = "Date":
- R5: "5" (submit by 5th day = Outstanding)
- R4: "10" (submit by 10th = Exceeds)
- R3: "15" (submit by 15th = Meets)
- R2: "20" (submit by 20th = Below)
- R1: "31" (submit by end of month = Needs Improvement)

### Employee Self Review
1. Opens self-review sheet for Date UOM KPI
2. Sees calendar picker restricted to review month
3. Clicks date (e.g., 8th)
4. System calculates: 8 is between R5(5) and R4(10) → Rating 4

### Manager/Auditor/Management Review
- Same calendar picker available
- Can override achieved date if needed
- Rating auto-calculates based on thresholds

---

## Validation Checklist

After implementation:
- [ ] Date UOM KPIs show calendar picker
- [ ] Calendar restricted to review month only
- [ ] Selecting date updates achieved value as day number
- [ ] Rating calculates correctly using thresholds as day limits
- [ ] Works at all review levels (Self, Manager, Auditor, Management)
- [ ] Unit tests pass for date rating calculations
- [ ] Documentation updated

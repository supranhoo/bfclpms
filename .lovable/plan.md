

# CAPA: Align Admin Data Entry Scoring with Self Review Logic

## Root Cause Analysis

The Admin Data Entry dialog and Self Review Sheet use **different scoring mechanisms** despite both needing to produce identical results. Here are the specific gaps:

### Gap Analysis

| # | Gap | Admin Data Entry (Current) | Self Review (Correct) | Severity |
|---|---|---|---|---|
| G1 | **Qualitative KPI handling** | Uses plain numeric `<Input>` for binary/tiered KPIs. Admin must type a number. | Uses `QualitativeValueInput` component with proper label selection (Yes/No, tiered options) that maps to ratings. | High |
| G2 | **Daily/Weekly qualitative special case** | Not handled. Uses generic `calculateRating` which may produce wrong results. | Has explicit branch: if qualitative + Daily/Weekly, clamps rating 0-5 directly from achieved value. | High |
| G3 | **Date UOM handling** | Uses plain numeric input. Admin must know that dates need special encoding. | Uses `DateCalendarInput` component for Date UOM KPIs. | Medium |
| G4 | **R0 threshold** | Passes `r0: null` (hardcoded). Ignores KPI's actual R0 value. | Passes `r0: kpi.r0` from the KPI data. | Medium |
| G5 | **Score calculation formula** | `score = (rating / 5) * weightage` -- treats rating as 0-5 scale divided by 5. | `self_score = calculatedScore` (raw rating from engine, which already factors weightage via `achievedWeight * weightage`). The engine returns `rating` (0-5) and `weightedScore` separately. | High |
| G6 | **Achieved value for qualitative KPIs** | Stores `parseFloat(achievedValue)` -- the raw text input. | Stores `calculatedScore` (the numeric rating) for qualitative KPIs, not the raw text. | High |
| G7 | **Rating level derivation** | Maps score 0-5 to dropdown, then maps dropdown to DB enum. | Uses `getRatingLevel(calculatedScore)` for numeric, or `calculatedRatingLevel` directly from qualitative selection. | Medium |
| G8 | **Org-level KPI prefill** | Not considered. Admin manually types values. | Checks `orgKpiValuesMap` to prefill achieved value from org-level data owner entries. | Low |
| G9 | **Threshold mode** | Passes `(kpi.threshold_mode as ...) \|\| 'absolute'` -- correct. | Same. | None |

### Impact

The current Admin Data Entry produces different rating/score values than Self Review for the same achieved value on the same KPI. This means:
- Admin entering "0" for a binary KPI gets a different result than an employee selecting "No"
- Scores stored by admin don't match what the scoring engine would calculate
- The Review Journey shows inconsistent data (as seen in the screenshot: Self=Rating 3, Management=Rating 3, but Manager/Auditor=Not Set)

## CAPA Plan

### C1: Add Qualitative Input Support to Admin Dialog

Replace the plain numeric input with conditional rendering:
- If KPI is binary/tiered, show `QualitativeValueInput` (same component used in Self Review)
- If KPI is Date UOM, show `DateCalendarInput`
- Otherwise, show the existing numeric input

### C2: Use Self Review's `calculateScoreFromAchieved` Logic

Extract the scoring logic from `SelfReviewSheet` into a shared utility or replicate the exact same function in Admin dialog. Key differences to fix:
- Include R0 threshold: `r0: kpi.r0` instead of `r0: null`
- Add the Daily/Weekly qualitative special case (clamp rating 0-5)
- Store `calculatedScore` as rating, not `(rating / 5) * weightage`

### C3: Fix Achieved Value Storage for Qualitative KPIs

When submitting for qualitative KPIs:
- Store the numeric rating (e.g., 5 for "Yes", 0 for "No") as `achieved_value`, not the raw text
- This matches Self Review behavior: `isQualitativeKpi ? calculatedScore : safeParseFloat(achievedValue)`

### C4: Fix Score Calculation

Current admin formula: `score = (rating / 5) * weightage`
Self Review stores: `self_score = calculatedScore` (which is the raw 0-5 rating from the engine)

The admin dialog needs to store the same value. The `calculateRating` engine returns `rating` (0-5) which is what Self Review stores as `self_score`. The weighted score is a separate field.

### C5: Fix Rating Level Derivation

Use the same `getRatingLevel` function from Self Review:
- Score >= 4 = blue
- Score >= 3 = green
- Score >= 2 = yellow
- Otherwise = red

For qualitative KPIs, use the rating level returned directly from `QualitativeValueInput`.

## Technical Details

### Files to Modify

| File | Change |
|---|---|
| `src/components/admin/AdminDataEntryDialog.tsx` | Major refactor: add qualitative/date input support, fix scoring logic, fix value storage |
| `DOCUMENTATION.md` | Document the alignment |

### Specific Code Changes

**1. Add imports for qualitative and date components:**
```text
import { QualitativeValueInput } from '@/components/review/QualitativeValueInput';
import { DateCalendarInput } from '@/components/review/DateCalendarInput';
import { QualitativeOption, scoreToRatingLevel } from '@/lib/qualitativeUom';
```

**2. Replace `autoCalculateFromAchieved` with Self Review's `calculateScoreFromAchieved`:**
```text
const calculateScoreFromAchieved = (achieved: number, kpi: KPI) => {
  const thresholds = { r5: kpi.r5, r4: kpi.r4, r3: kpi.r3, r2: kpi.r2, r1: kpi.r1, r0: kpi.r0 };
  const uomType = kpi.uom_type || 'numeric';
  const isQualitative = uomType === 'binary' || uomType === 'tiered';

  // Special case: qualitative + daily/weekly
  if (isQualitative && (kpi.frequency === 'Daily' || kpi.frequency === 'Weekly')) {
    const rating = Math.min(5, Math.max(0, Math.round(achieved)));
    return { rating, ratingLevel: getRatingLevel(rating), ... };
  }

  return calculateRating(achieved, kpi.target_value, thresholds,
    kpi.criteria || 'Higher is Better', kpi.weightage || 0,
    uomType, kpi.qualitative_options, kpi.uom, kpi.threshold_mode || 'absolute');
};
```

**3. Conditional input rendering:**
```text
{isQualitativeKpi(kpi) ? (
  <QualitativeValueInput
    kpi={kpi}
    value={achievedValue}
    onChange={handleQualitativeChange}
  />
) : kpi.uom === 'Date' ? (
  <DateCalendarInput value={achievedValue} onChange={handleDateChange} />
) : (
  <Input type="number" ... />  // existing numeric input
)}
```

**4. Fix handleSubmit to match Self Review:**
```text
// For qualitative KPIs, store rating as achieved_value (not raw text)
achieved_value: isQualitativeKpi(kpi)
  ? calculatedScore   // numeric rating (0-5)
  : parseFloat(achievedValue),

// Rating level
rating: isQualitativeKpi(kpi)
  ? calculatedRatingLevel   // from qualitative selection
  : (calculatedScore !== null ? getRatingLevel(calculatedScore) : null),

// Score = raw rating (0-5), NOT (rating/5)*weightage
score: calculatedScore,
```

**5. Add state for qualitative tracking:**
```text
const [calculatedRatingLevel, setCalculatedRatingLevel] = useState<RatingLevel | null>(null);

const handleQualitativeChange = (value: string, rating: number, ratingLevel: RatingLevel) => {
  setAchievedValue(value);
  setCalculatedScore(rating);        // store as state for submit
  setCalculatedRatingLevel(ratingLevel);
  // Also update the display score
  setScore(rating.toString());
  setRating(String(rating));
  setIsAutoCalculated(true);
};
```

### Risk Assessment
- **Low risk**: Changes are confined to the Admin Data Entry dialog
- **No schema changes**: Same DB fields, just correct values being stored
- **Backward compatible**: Existing submissions are not modified; only new admin entries will use the corrected logic
- **Testable**: Enter the same achieved value via Self Review and Admin Data Entry -- both should produce identical rating/score


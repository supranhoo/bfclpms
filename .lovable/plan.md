

# RCA and CAPA: Admin Data Entry -- Rating Dropdown Gaps, Score Limits, and Auto-Calculation

## Root Cause Analysis (RCA)

### Issue 1: Rating not driven by Achieved Value reliably
The auto-calculation engine (`autoCalculateFromAchieved`) exists but has a flaw: when `calculateRating()` returns a rating of **0** or **1**, the `ratingToLevel()` function maps both to `'red'`. The dropdown then shows "Below (2)" as the selected value -- which is wrong. The `calculateRating` engine correctly returns 0 or 1, but the UI cannot represent these values because the Rating dropdown only has 4 options (scores 2-5).

**Evidence from code** (line 29-34):
```text
RATING_OPTIONS = [
  { value: 'blue',   label: 'Outstanding (5)', score: 5 },
  { value: 'green',  label: 'Exceeds (4)',     score: 4 },
  { value: 'yellow', label: 'Meets (3)',       score: 3 },
  { value: 'red',    label: 'Below (2)',       score: 2 },
]
```
Ratings 1 ("Needs Improvement") and 0 ("Not Achieved") are absent.

### Issue 2: Rating dropdown missing 0 and 1
The `RATING_OPTIONS` array only defines 4 levels (2-5). The scoring engine supports a full 0-5 range. When auto-calculation returns rating=1 or rating=0, the `ratingToLevel` maps both to `'red'`, so the dropdown shows "Below (2)" -- displaying the wrong rating and computing the wrong score.

### Issue 3: Score can exceed the maximum allowed value
The Score field is a plain `<Input type="number">` with no upper bound validation. The maximum valid score for a KPI is `(5/5) * weightage = weightage`. For example, a KPI with weightage 1.5% should never have a score above 1.50. Currently an admin can type any number (e.g., 10, 100), which corrupts the scoring totals.

| Issue | Root Cause |
|---|---|
| Auto-calc shows wrong rating for 0/1 | `RATING_OPTIONS` only has 4 entries (2-5); ratings 0 and 1 have no dropdown option |
| Dropdown missing options | `RATING_OPTIONS` array is incomplete |
| Score exceeds maximum | No `max` attribute or validation on the score input field |

---

## Corrective and Preventive Action (CAPA)

### Fix 1: Expand RATING_OPTIONS to include all 6 ratings (0-5)

**File: `src/components/admin/AdminDataEntryDialog.tsx`**

Add two new entries to `RATING_OPTIONS`:

| Value | Label | Score | Color |
|---|---|---|---|
| `orange` | Needs Improvement (1) | 1 | orange-500 |
| `gray` | Not Achieved (0) | 0 | gray-400 |

Since the database `rating_level` enum only supports `blue | green | yellow | red`, the new dropdown entries will still map to the `red` DB enum value but display distinct labels. The auto-calculate logic will use the **numeric score** (0-5) as the source of truth, with the rating dropdown serving as a visual aid only.

Updated approach:
- Change the Rating state from storing a `RatingLevel` color to storing the **numeric score** (0-5) internally
- The dropdown displays all 6 options with distinct labels and colors
- On submit, the numeric score is mapped to the closest DB-compatible `RatingLevel` via `ratingToLevel()`

### Fix 2: Cap the Score field at maximum allowed value

**File: `src/components/admin/AdminDataEntryDialog.tsx`**

Add validation to the Score input:
- Set `max` attribute to `(5/5) * weightage = weightage`
- On blur or change, clamp the value: `Math.min(parseFloat(value), maxScore)`
- Display the maximum allowed score as helper text below the field

Formula: `maxScore = kpi.weightage` (since max rating is 5, and score = (rating/5) * weightage)

### Fix 3: Ensure auto-calculate correctly populates all rating levels

**File: `src/components/admin/AdminDataEntryDialog.tsx`**

Update `autoCalculateFromAchieved` to:
1. Store the raw numeric rating (0-5) from `calculateRating()` result
2. Map it to the expanded dropdown option
3. Calculate score as `(result.rating / 5) * weightage`, clamped to max

### Files to Modify

| File | Change |
|---|---|
| `src/components/admin/AdminDataEntryDialog.tsx` | Expand `RATING_OPTIONS` to 6 levels (0-5). Add score max validation with `max` attribute and clamping logic. Update auto-calculate to correctly populate all rating levels. Add helper text showing max score. |
| `DOCUMENTATION.md` | Document the expanded rating scale and score capping behavior in Admin Data Entry |

### Technical Detail

**Expanded RATING_OPTIONS:**
```text
Score 5 -> blue   -> "Outstanding (5)"
Score 4 -> green  -> "Exceeds (4)"
Score 3 -> yellow -> "Meets (3)"
Score 2 -> red    -> "Below (2)"
Score 1 -> red    -> "Needs Improvement (1)"
Score 0 -> red    -> "Not Achieved (0)"
```

**Score clamping logic:**
```text
maxScore = kpi.weightage  // e.g., 1.5 for 1.5% weightage
score = Math.min(enteredScore, maxScore)
score = Math.max(score, 0)  // floor at 0
```

**Rating state change:**
Instead of storing `RatingLevel` (color string), the Rating select will use string-encoded numeric scores ("5", "4", "3", "2", "1", "0") as values. On submit, the numeric score maps to a `RatingLevel` via `ratingToLevel()` for DB storage.

### Risk

Low -- the scoring engine already supports 0-5 ratings. This change only updates the Admin UI to expose the full range. The `ratingToLevel()` function already handles the 0-1 range by mapping to `'red'`, so DB compatibility is maintained. The score clamping prevents data corruption without breaking any existing valid entries.


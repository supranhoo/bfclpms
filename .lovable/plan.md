

# CAPA: Binary KPI Scoring Misclassification in Admin Data Entry

## Root Cause Analysis (RCA)

### What Happened
The Admin Data Entry dialog shows "Achieved Value: 0" with "Rating: Outstanding (5)" and "Score: 3.00" for a binary KPI called "Closure of Audit Observations." This is displaying stale/incorrect data from the existing submission, and the auto-calculation engine cannot properly re-evaluate it.

### Root Cause Chain

1. **Data Classification Mismatch**: 785 KPIs (100% of binary KPIs) are marked as `uom_type = 'binary'` with `uom = 'Number'`, but have NO `qualitative_options` defined and mostly NO thresholds (R5-R1). These KPIs use numeric values (e.g., 0 = zero pending issues = best), not Yes/No labels.

2. **Scoring Engine Dead Branch**: When `calculateRating()` receives a numeric achieved value for a binary KPI:
   - It checks `typeof achievedValue === 'string'` -- fails because the admin dialog passes `parseFloat(value)` (a number)
   - Falls through to return rating 0 silently
   - Even if a string were passed (e.g., "0"), no matching option exists in `BINARY_OPTIONS` (which only has "Yes"/"No")

3. **Stale Data Display**: The dialog loads the existing submission values (`self_rating = 'blue'`, `self_score = 5.00`) without re-validating them. These were likely set during the original import or a previous manual entry.

4. **No Fallback Logic**: When auto-calculation fails for binary KPIs (no options match), the system silently does nothing instead of falling back to numeric threshold comparison or alerting the admin.

### Scope of Impact
- **785 binary KPIs** across the system have no `qualitative_options` configured
- Only 4 of these have any thresholds (R5) set at all
- Auto-calculation is broken for all of them in the Admin Data Entry dialog

## Gap Analysis

| Gap | Description | Severity |
|---|---|---|
| G1 | Binary KPIs with numeric values cannot be auto-scored | High |
| G2 | No fallback from binary to numeric scoring when options are missing | High |
| G3 | Stale existing values displayed without validation warning | Medium |
| G4 | Admin dialog does not warn when auto-calculation cannot run | Medium |
| G5 | `parseFloat()` conversion strips string type needed by binary engine | Medium |

## CAPA (Corrective and Preventive Actions)

### Corrective Actions (Fix the existing bug)

#### C1: Add numeric fallback for binary KPIs without qualitative options
**File**: `src/lib/ratingCalculation.ts`

In the binary/tiered branch (lines 144-165), when `qualitativeOptions` is null/empty AND the achieved value is numeric, fall back to threshold-based calculation instead of returning 0. This means:
- If R5-R1 thresholds exist, use `calculateAbsoluteRating()` with the numeric value
- If thresholds also don't exist but target exists, use ratio-based calculation
- Only return rating 0 as a last resort

#### C2: Fix type handling in Admin Data Entry auto-calculate
**File**: `src/components/admin/AdminDataEntryDialog.tsx`

In `autoCalculateFromAchieved`, for binary KPIs:
- Pass the raw string value to `calculateRating` (not `parseFloat`) so the binary engine can attempt label matching first
- If the value is numeric (not a label like "Yes"/"No"), explicitly switch to numeric scoring path

#### C3: Add validation warning for misconfigured KPIs
**File**: `src/components/admin/AdminDataEntryDialog.tsx`

Display a warning banner when:
- KPI is binary but has no `qualitative_options` and no thresholds
- Auto-calculation cannot determine a rating
- The loaded existing values appear inconsistent (e.g., achieved=0 but rating=5 for "Higher is Better")

#### C4: Add consistency check on existing data load
**File**: `src/components/admin/AdminDataEntryDialog.tsx`

When loading existing submission values, re-run the calculation engine and compare. If the stored rating differs from the calculated rating, show a warning: "Stored rating (Outstanding) differs from calculated rating (Not Achieved). The KPI may be misconfigured."

### Preventive Actions (Prevent recurrence)

#### P1: Improve import validation for binary KPIs
**File**: `src/lib/importValidation.ts`

During KPI import, when `uom_type = 'binary'`:
- Warn if no `qualitative_options` are provided
- Auto-generate default Yes/No options if none specified
- Validate that at least R5 threshold is set

#### P2: Add KPI configuration health check
**File**: `src/pages/admin/AllKpis.tsx` (or new component)

Add a "Configuration Issues" indicator on the All KPIs dashboard that flags:
- Binary KPIs without qualitative options
- KPIs without any thresholds
- KPIs with mismatched uom_type and uom

## Technical Details

### Files to Modify

| File | Change |
|---|---|
| `src/lib/ratingCalculation.ts` | Add numeric fallback in binary branch when no options match |
| `src/components/admin/AdminDataEntryDialog.tsx` | Fix type handling, add validation warnings, add consistency check |
| `src/lib/importValidation.ts` | Add binary KPI validation rules |
| `DOCUMENTATION.md` | Document the fix |

### Key Code Change (ratingCalculation.ts, binary branch)

Current (broken):
```text
if (uomType === 'binary' || uomType === 'tiered') {
  const stringValue = typeof achievedValue === 'string' ? achievedValue : null;
  if (!stringValue) {
    return { rating: 0, ... };  // SILENTLY FAILS for numeric values
  }
  // ... label matching
}
```

Fixed:
```text
if (uomType === 'binary' || uomType === 'tiered') {
  const stringValue = typeof achievedValue === 'string' ? achievedValue : null;
  const options = uomType === 'binary' ? BINARY_OPTIONS : qualitativeOptions || [];

  // Try label matching first
  if (stringValue) {
    const selected = options.find(opt => opt.label === stringValue);
    if (selected) { /* existing logic */ }
  }

  // FALLBACK: If no label match (numeric value or missing options),
  // treat as numeric and use thresholds
  const numVal = typeof achievedValue === 'number' ? achievedValue : parseFloat(String(achievedValue));
  if (!isNaN(numVal)) {
    // Check if thresholds exist
    const hasThresholds = [thresholds.r5, thresholds.r4, thresholds.r3, thresholds.r2, thresholds.r1]
      .some(t => t !== null && t !== undefined);
    if (hasThresholds) {
      return calculateAbsoluteRating(numVal, thresholds, criteria, weightage, target || 0);
    }
  }

  // Final fallback: rating 0
  return { rating: 0, ... };
}
```

### Admin Dialog Warning (AdminDataEntryDialog.tsx)

Add a yellow warning banner when binary KPI has no options:
```text
"This KPI is configured as Binary but has no scoring options defined.
Auto-calculation may be inaccurate. Please verify the rating manually."
```

### Risk
Low -- the fallback logic is additive. Existing correctly-configured binary KPIs (with Yes/No labels) will continue to match labels first and never reach the fallback.


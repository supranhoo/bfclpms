

# Fix: Binary Org KPI Value and Rating Not Displaying in Reviewer Input

## Root Cause Analysis

The value and rating are correctly stored in the database (`achieved_value=5`, `self_score=0`) and correctly displayed in the **Review Journey** cards (Self stage shows "Value: 5, Rating: 0"). However, the **reviewer's input fields** (the Yes/No selector below the review panel) appear empty.

### Root Cause: Numeric-to-String Type Mismatch

In `AchievedValueScoreInput.tsx` (line 176), the value is passed to `QualitativeValueInput` with this logic:

```text
value={typeof achievedValue === 'string' ? achievedValue : null}
```

For org-level binary KPIs, `reviewerAchievedValue` is initialized from `existing?.achieved_value`, which is a **NUMBER** (5), not a **STRING** ("Yes"). Since `typeof 5 !== 'string'`, the value is passed as `null` to `QualitativeValueInput`, which then shows no button selected and no score displayed.

The `QualitativeValueInput` component finds the selected option by matching `opt.label === value` (line 70 of that file). When `value` is `null`, nothing matches, so the UI shows blank -- the "Yes"/"No" buttons appear unselected.

### Why Remarks Work but Value Doesn't

Remarks are stored as plain strings (`self_remarks`) and read directly. The achieved value goes through the qualitative rendering pipeline which expects string labels ("Yes"/"No"), not their numeric mappings (5/0).

## Fix

### File: `src/components/review/AchievedValueScoreInput.tsx` (line ~171-186)

Before passing to `QualitativeValueInput`, reverse-map numeric achieved values back to their qualitative label using the option definitions (BINARY_OPTIONS or custom qualitative_options).

```text
Current (line 176):
  value={typeof achievedValue === 'string' ? achievedValue : null}

Fixed:
  value={(() => {
    if (typeof achievedValue === 'string') return achievedValue;
    if (typeof achievedValue === 'number') {
      const opts = kpi.qualitative_options?.length
        ? kpi.qualitative_options
        : (uomType === 'binary' ? BINARY_OPTIONS : []);
      return opts.find(o => o.rating === achievedValue)?.label || null;
    }
    return null;
  })()}
```

This requires importing `BINARY_OPTIONS` from `@/lib/qualitativeUom` (it's already imported indirectly via the type import but needs a direct value import).

### Impact

- **Binary KPIs**: numeric 5 maps to "Yes", numeric 0 maps to "No" -- buttons correctly highlighted
- **Tiered KPIs**: numeric values map back to their custom option labels
- **Non-qualitative KPIs**: unaffected (they use the numeric input path, not QualitativeValueInput)
- **Self-review**: unaffected (SelfReviewSheet stores string values directly)
- **All reviewer levels**: fixed (manager, auditor, skip-level, HR PMS, management)

## Risk Assessment

| Aspect | Risk | Mitigation |
|--------|------|------------|
| Data | None -- display-only change | No database writes affected |
| Regression | Very low -- only affects qualitative input path | Non-qualitative KPIs use a different code branch |
| Edge case | Multiple options with same rating | `find()` returns first match, which is acceptable |

## Files Changed

| File | Change |
|------|--------|
| `src/components/review/AchievedValueScoreInput.tsx` | Add numeric-to-label reverse mapping for qualitative value prop |


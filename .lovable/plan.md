

# Plan: Fix Binary/Tiered KPI Input in Review Workflows

## Problem Summary

When a KPI has UOM Type set to "Binary" or "Tiered", users should see option buttons (Yes/No or custom tiers) instead of a numeric input field. Currently, the self-review interfaces always show a number input regardless of the KPI type.

## Files to Modify

| File | Purpose |
|------|---------|
| `src/pages/MyKpis.tsx` | Main self-review sheet - add qualitative input support |
| `src/components/review/DailySubmissionGrid.tsx` | Daily entries - add qualitative input support |
| `src/components/review/WeeklySubmissionTable.tsx` | Weekly entries - add qualitative input support |
| `DOCUMENTATION.md` | Update documentation |

## Technical Implementation

### 1. Update MyKpis.tsx Self-Review Sheet

**Current behavior (lines 909-946):**
Always renders a numeric input field for achieved value.

**New behavior:**
- Check if `selectedKpi?.uom_type === 'binary'` or `'tiered'`
- If qualitative: render `QualitativeValueInput` component instead of numeric input
- Store the selected label as achieved value (string)
- Auto-calculate score based on the selected option's rating

**Changes needed:**
- Import `QualitativeValueInput` component
- Import `calculateQualitativeRating` utility
- Update state handling to support string values for qualitative KPIs
- Conditional rendering in the achieved value section
- Update `handleSubmitReview` to handle string achieved values

### 2. Update DailySubmissionGrid.tsx

**Current behavior:**
Each day row has a numeric input for achieved value.

**New behavior:**
- Accept `uomType` and `qualitativeOptions` as props
- When editing a day entry:
  - If numeric: show number input (current behavior)
  - If binary/tiered: show option buttons inline or in a compact dropdown

### 3. Update WeeklySubmissionTable.tsx

Same pattern as DailySubmissionGrid - add qualitative input support for weekly entries.

## Visual Preview

### Binary KPI in Self-Review Sheet

```
┌─────────────────────────────────────────────────────┐
│ Achieved Value *                                     │
├─────────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌─────────────────┐          │
│  │      Yes        │  │       No        │          │
│  │    ⭐ R5        │  │     ⭐ R0        │          │
│  └─────────────────┘  └─────────────────┘          │
│                                                      │
│  ┌───────────────────────────────────────────────┐  │
│  │ ℹ️ Selected: Yes                               │  │
│  │    Requirement fully met                       │  │
│  │    Score: 5 - Outstanding                      │  │
│  └───────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

### Daily Grid with Binary Options

```
┌──────────┬───────────────────────────────────┬────────┐
│ Date     │ Achieved Value                    │ Status │
├──────────┼───────────────────────────────────┼────────┤
│ 1 Jan    │ [Yes ▾]                           │ ✓ Done │
│ 2 Jan    │ [Select option... ▾]              │ Pending│
│ 3 Jan    │ [No ▾]                            │ ✓ Done │
└──────────┴───────────────────────────────────┴────────┘
```

## State Management Updates

### MyKpis.tsx Changes

```typescript
// Current state - only handles numbers
const [achievedValue, setAchievedValue] = useState('');

// Need to also track:
// - For binary/tiered: store the label string
// - Calculate score from the selected option

const handleQualitativeChange = (value: string, rating: number, ratingLevel: RatingLevel) => {
  setAchievedValue(value); // Store label like "Yes", "No", "Partial"
  setCalculatedScore(rating);
  // Rating level already provided
};
```

### Submission Data Handling

For qualitative KPIs, the `achieved_value` column stores the selected label (e.g., "Yes"), while the score is derived from the option's predefined rating.

## Affected Workflows

1. **Self Review (MyKpis.tsx)** - Primary user-facing review interface
2. **Daily Submissions** - For Daily frequency KPIs with qualitative options
3. **Weekly Submissions** - For Weekly frequency KPIs with qualitative options
4. **Manager/Audit Scorecards** - Already use `AchievedValueScoreInput` which handles this correctly

## Testing Checklist

After implementation:
- Create a Binary UOM type KPI and verify Yes/No buttons appear in self-review
- Create a Tiered UOM type KPI with custom options and verify dropdown/buttons work
- Test Daily frequency + Binary combination
- Test Weekly frequency + Tiered combination
- Verify scores are correctly calculated from selected options
- Verify submitted data saves the label string correctly


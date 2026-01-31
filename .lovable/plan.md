
## Summary
Update the KRA acceptance terminology throughout the Self Review sheet to remove the "acceptance" concept, since users should not be given an option for acceptance - they simply review and submit.

## Changes Required

### File: `src/pages/MyKpis.tsx`

| Line | Current Text | New Text |
|------|--------------|----------|
| 599 | `'Accept KRA & Submit Review'` | `'Submit Self Review'` |
| 814 | `'Accept & Submit'` | `'Review & Submit'` |
| 642 | `'- Review the KPI details below and submit your self-review to accept this KRA'` | `'- Review the KPI details below and submit your performance data'` |

## Technical Details

The changes are purely cosmetic/text updates:

1. **Sheet Title (Line 599)**: The conditional title for `isKraSet` status will now show the same "Submit Self Review" text as other statuses, making the experience consistent.

2. **Submit Button (Line 814)**: The button text changes from "Accept & Submit" to "Review & Submit" to reflect that users are reviewing and submitting, not accepting.

3. **Info Banner (Line 642)**: The helper text in the amber info banner will be updated to remove the acceptance language while still guiding users to submit their performance data.

## Impact
- No workflow or database changes
- No functional changes to the submission logic
- Pure UI text updates for clearer user messaging
- Documentation will be updated to reflect the new terminology

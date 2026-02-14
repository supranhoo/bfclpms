

# RCA and CAPA: Duplicate Rating Scale in Self Review Sheet

## Root Cause

In `SelfReviewSheet.tsx` (lines 467-472), a standalone `<RatingScaleDisplay>` component is rendered directly below the `<KpiReviewPanel>`. However, `KpiReviewPanel` already includes `<KpiMetricsSection>`, which displays the exact same rating scale (R5 through R1) inside the "Metrics and Scale" card.

This results in the rating scale appearing twice on screen -- once compactly inside the panel's left column, and again as a full-width card below the panel.

## Fix

**File: `src/components/review/SelfReviewSheet.tsx`** (lines 467-472)

Remove the standalone `<RatingScaleDisplay>` block:

```text
{/* Rating Scale */}
{selectedKpi && (
  <RatingScaleDisplay kpi={selectedKpi} />
)}
```

This section is fully redundant since `KpiMetricsSection` (rendered inside `KpiReviewPanel`) already displays the same R5-R1 values with tooltips.

Also clean up the unused import for `RatingScaleDisplay` if it is no longer used elsewhere in the file.

**File: `DOCUMENTATION.md`** -- Note the removal of the duplicate rating scale from the self-review sheet.

## Files to Modify

| File | Change |
|---|---|
| `src/components/review/SelfReviewSheet.tsx` | Remove duplicate `RatingScaleDisplay` block and its import |
| `DOCUMENTATION.md` | Update to reflect the fix |

## Risk

Very Low -- purely removing a redundant UI element. No logic, data, or workflow changes.

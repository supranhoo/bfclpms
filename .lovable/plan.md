

# Reduce Grey Space Between Category Bars

## Problem

The chart container height is calculated as `categoryCount * 50px`, giving each row 50px of vertical space. With `barSize={12}`, each colored bar only uses 12px, leaving ~38px of grey padding per row.

## Change

Reduce the per-category height multiplier from `50` to `28` across all files that render `CategoryScoreChart`. This keeps bar height (`barSize=12`) unchanged but compresses the grey padding around each bar from ~38px to ~16px.

### Files to update:

**`src/pages/Dashboard.tsx` (line 471)**
- Change `categoryMetrics.length * 50` to `categoryMetrics.length * 28`

**`src/components/review/UnifiedScorecard.tsx` (line 752)**
- Change `scoreData.categoryScores.length * 50` to `scoreData.categoryScores.length * 28`

**`DOCUMENTATION.md`**
- Update the chart row height note from 50px to 28px per category


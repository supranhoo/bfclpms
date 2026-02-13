
# Fix: Review Timeline Mobile UI Issues

## Issues Identified

### 1. Workflow Progress Bar Overflow
The 6 workflow stages each have `minWidth: 48px` (288px total) plus connector lines. On a 390px mobile screen with 80px of combined padding (dialog p-6 + inner p-4), only ~310px remains. Stage labels like "Self Review" and "Management" get cramped and the connector lines compress to nearly zero width.

### 2. Timeline Card Layout Too Wide
Each timeline entry uses `flex items-start justify-between gap-4` with the timestamp forced to `whitespace-nowrap` on the right side. On mobile, this leaves very little room for the action label and details text, causing text to wrap awkwardly.

### 3. Dialog Padding Too Large
The dialog uses `p-6` (24px each side) which is excessive on small screens, wasting 48px of horizontal space.

### 4. Badge Row Overflow
The KRA name badge and period badge sit in a horizontal row that can overflow if the KRA name is long.

## Fix Plan

### File: `src/components/dashboard/KpiTimeline.tsx`

**Fix 1 -- Reduce mobile padding**
Change `DialogContent` className to use `p-4 sm:p-6` so mobile gets tighter padding.

**Fix 2 -- Responsive workflow progress**
- Hide the text labels on mobile, show only icons (add `hidden sm:block` to the label span)
- Reduce `minWidth` to 32px on mobile via a responsive approach
- This prevents the 6 labels from fighting for space

**Fix 3 -- Stack timestamp below content on mobile**
Change the timeline card layout from side-by-side to stacked on mobile:
- Use `flex-col sm:flex-row sm:items-start sm:justify-between` on the card inner div
- Move timestamp to bottom-left with `text-left sm:text-right` and remove `whitespace-nowrap` on mobile

**Fix 4 -- Truncate badges**
Add `max-w-[150px] truncate` to the KRA name badge so it doesn't push the period badge off-screen. Wrap in `flex-wrap` for safety.

### File: `DOCUMENTATION.md`
Update the mobile optimization section to document the Review Timeline mobile fixes.

## Summary

| Fix | Issue | Approach |
|-----|-------|----------|
| 1 | Dialog padding too large | `p-4 sm:p-6` |
| 2 | Workflow stages overflow | Hide labels on mobile, icon-only |
| 3 | Timeline cards cramped | Stack timestamp below on mobile |
| 4 | Badge overflow | Truncate + flex-wrap |



# Fix: Organization KPI Data Entry Page Width Overflow

## Problem

The page has horizontal overflow caused by multiple elements:

1. **Long KPI names** -- The card title shows the full KPI description (e.g., "Adherence to Manning Norms: - Description: Measures the variance between...") without truncation, pushing the card wider than the viewport.
2. **Category pills row** -- The row of category badges extends beyond the right edge.
3. **Progress category badges** -- Same overflow in the progress section.
4. **Card input grid** -- The 3-column grid (Achieved, Remark, Upload) doesn't constrain properly on the available width.

## Root Cause

The main page container (`div className="space-y-6"`) has no `overflow-hidden` or `min-w-0`, so child content with long text or many inline elements breaks out of the layout bounds. Additionally, the `OrgKpiEntryCard` title uses `truncate` but the parent doesn't properly constrain width.

## Fixes

### File: `src/pages/admin/OrgKpiDataEntry.tsx`

1. Add `min-w-0 overflow-hidden` to the root container (line 484)
2. Wrap category pills in a scrollable container with `overflow-x-auto`
3. Wrap progress category badges similarly

### File: `src/components/admin/OrgKpiEntryCard.tsx`

1. Add `min-w-0 overflow-hidden` to the Card root
2. Ensure the KPI name `h3` truncates properly by constraining its parent width
3. Add `min-w-0` to the input grid container

### File: `src/components/admin/OrgKpiProgressBar.tsx`

1. Wrap the category progress badges in `overflow-x-auto` or `flex-wrap` to prevent horizontal overflow

## Technical Details

| File | Change |
|---|---|
| `src/pages/admin/OrgKpiDataEntry.tsx` | Add `min-w-0 overflow-hidden` to root div; wrap pills in scrollable container |
| `src/components/admin/OrgKpiEntryCard.tsx` | Add `min-w-0 overflow-hidden` to Card; ensure text truncation works |
| `src/components/admin/OrgKpiProgressBar.tsx` | Add `flex-wrap` or `overflow-x-auto` to badges row |
| `DOCUMENTATION.md` | Update if needed |

All changes are CSS-only -- no logic or data changes.


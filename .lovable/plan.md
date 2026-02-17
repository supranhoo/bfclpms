

# Fix KRA Issuance Dialog Layout Issues

## Problem

From the screenshot, the "Issue KRAs -- Confirmation" dialog has three issues:
1. **Cannot scroll down** -- the KPI table area does not scroll, so rows beyond what fits on screen are inaccessible
2. **Columns cut off** -- the Weightage column is partially hidden on the right edge, and the Frequency column is completely invisible
3. **Category text overflows** -- long category names like "Excellence & Process Improvement" break the badge layout

## Before

- Dialog width: `max-w-3xl` (48rem / 768px) -- too narrow for 8 columns with editable inputs
- Table scroll: Uses `ScrollArea` component which can fail in nested flex layouts (per project standard)
- No horizontal scroll support for the table on smaller screens
- Category badges have no width constraint, pushing other columns off-screen

## Changes

### File: `src/components/admin/KraIssuanceConfirmDialog.tsx`

1. **Widen dialog**: Change `max-w-3xl` to `max-w-5xl` to fit all 8 columns comfortably
2. **Replace ScrollArea with native scroll**: Per the project's `native-scrolling-standard`, switch to `overflow-y-auto` with a fixed `max-h` for reliable scrolling
3. **Add horizontal overflow**: Wrap the table in `overflow-x-auto` so columns are accessible on smaller screens
4. **Constrain category badges**: Add `max-w-[100px]` and `truncate` to prevent long category names from consuming too much space
5. **Tighten cell padding**: Use smaller padding on cells to maximize content space

### File: `DOCUMENTATION.md`

- Update the dialog layout notes

## After

- Dialog is wider (max-w-5xl / 64rem), showing all columns including Weightage and Frequency without cutoff
- The KPI table scrolls vertically (native `overflow-y-auto`) when there are many rows (e.g., 19 KPIs)
- On smaller screens, the table scrolls horizontally so no columns are hidden
- Category names are neatly truncated within badges with tooltips

## Technical Detail

Key class changes on `DialogContent`:
```
max-w-3xl  -->  max-w-5xl
```

Table container change:
```tsx
// Before: ScrollArea (unreliable in nested flex)
<ScrollArea className="flex-1 min-h-0 border rounded-lg">

// After: Native scroll with explicit max height
<div className="flex-1 min-h-0 overflow-y-auto overflow-x-auto border rounded-lg">
```

Category badge constraint:
```tsx
<Badge variant="outline" className="text-xs max-w-[100px] truncate">
```




# Fix: Add Scrolling to KRA Rollover Preview (Step 2)

## Problem

The KRA Rollover dialog's Step 2 (Preview) does not scroll when the content overflows, making it impossible to see all conflict rows or reach the action buttons when there are many employees.

## Root Cause

The `ScrollArea` component at line 237 uses `flex-1` to fill available space, but in a flex column layout, flex children don't shrink below their content size by default. The missing `min-h-0` class prevents the browser from allowing the ScrollArea to shrink and activate its internal scrollbar.

## Fix

**File: `src/components/admin/RolloverDialog.tsx` (line 237)**

Add `min-h-0` to the ScrollArea so it can shrink within the flex container and enable scrolling:

```
// Before
<ScrollArea className="flex-1 pr-4">

// After
<ScrollArea className="flex-1 min-h-0 pr-4">
```

This is a single-line CSS class addition -- no logic changes needed. The `min-h-0` overrides the default `min-height: auto` on flex children, allowing the ScrollArea to respect the dialog's `max-h-[85vh]` constraint and scroll its overflow content.


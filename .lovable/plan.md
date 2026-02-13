

# Fix: Scrolling Not Working in Review Timeline

## Root Cause

The Radix `ScrollArea` component's internal `Viewport` doesn't reliably resolve `h-full` through nested flex containers. Despite the correct flex chain (`flex-1 min-h-0` wrapper with `h-full` ScrollArea), the Radix viewport calculates its height from content rather than the container, preventing scroll activation.

## Fix

### File: `src/components/dashboard/KpiTimeline.tsx`

Replace the Radix `ScrollArea` with a native scrollable `div` using `overflow-y-auto`. This is reliable across all browsers and doesn't depend on Radix's internal height calculations.

**Current (lines 247-317):**
```tsx
<div className="flex-1 min-h-0 overflow-hidden">
  <ScrollArea className="h-full pr-4">
    {/* timeline content */}
  </ScrollArea>
</div>
```

**Fixed:**
```tsx
<div className="flex-1 min-h-0 overflow-y-auto pr-4">
  {/* timeline content directly */}
</div>
```

This collapses two elements into one: a single div that both fills available flex space and scrolls natively. The `ScrollArea` import can also be removed from the file.

### File: `DOCUMENTATION.md`

Update the Review Timeline entry to note it uses native overflow scrolling instead of Radix ScrollArea.


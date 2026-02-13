

# Fix: Missing Scrollbar in Review Timeline

## Root Cause

The `ScrollArea` uses `flex-1 min-h-0` to fill available space, but the Radix `ScrollAreaPrimitive.Viewport` inside it needs the parent to have a resolved pixel height for the scrollbar to activate. In the current flex layout, the height resolves correctly for containment but the ScrollArea component's internal viewport doesn't trigger its scrollbar because `flex-1` alone doesn't always give Radix a concrete height to compare against.

## Fix

### File: `src/components/dashboard/KpiTimeline.tsx` (line 247)

Wrap the `ScrollArea` in a container div that has `flex-1 min-h-0 overflow-hidden`, and give the `ScrollArea` an explicit `h-full` so the Radix viewport gets a resolved height:

```
Current:  <ScrollArea className="flex-1 min-h-0 pr-4">
Fixed:    wrapped in <div className="flex-1 min-h-0 overflow-hidden">
            <ScrollArea className="h-full pr-4">
```

This ensures the outer div resolves to a concrete pixel height via flex, and `h-full` on ScrollArea gives Radix the height it needs to show the scrollbar.

### File: `DOCUMENTATION.md`
Update to note the ScrollArea wrapper pattern for flex layouts.


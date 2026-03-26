

## Fix: KRA Library Search Results Still Not Scrolling

### Root Cause

The Radix `ScrollArea` component requires the **root element** to have a **concrete height constraint** that the internal `Viewport` can measure against. Setting `max-h-[400px]` on the `ScrollArea` root alone doesn't reliably trigger the internal scrollbar because the Viewport uses `h-full w-full` and inherits the unconstrained content height.

### Fix — `src/components/admin/KraLibrarySearchPanel.tsx`

Replace the Radix `ScrollArea` wrapper with a simple `div` that uses native CSS overflow scrolling. This is more reliable for dynamic content:

**Current (line 209):**
```tsx
<ScrollArea className="max-h-[400px]">
```

**After:**
```tsx
<div className="max-h-[400px] overflow-y-auto">
```

And remove the closing `</ScrollArea>` tag (replace with `</div>`), and remove the `ScrollArea` import since it's no longer used.

### Risk Assessment
- **Data Impact**: None
- **Workflow Impact**: None
- **Regression Risk**: Zero — swapping scroll container implementation only, content unchanged

### Files Changed
1. **`src/components/admin/KraLibrarySearchPanel.tsx`** — Replace Radix ScrollArea with native overflow-y-auto div


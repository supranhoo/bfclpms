

# Plan: Enable Scrolling in Self Review Sheet for Daily KPIs

## Problem

When an employee opens the "Submit Self Review" sheet for a Daily KPI, the page content (especially the Daily Submission Summary table) can exceed the available viewport height, but there's no scroll functionality to view the overflow content.

## Root Cause

The current sheet layout structure prevents scrolling:

| Element | Current Class | Issue |
|---------|---------------|-------|
| Main content container (line 972) | `flex-1 grid grid-cols-3 gap-4 py-4 min-h-0` | Missing `overflow-auto` to enable scrolling |
| Right column (line 1109) | `flex flex-col space-y-4` | No height constraint or overflow handling |

## Solution

Wrap the main content area in a scrollable container so users can scroll up and down to view all content, including the Daily Submission Summary table.

## Files to Modify

| File | Change |
|------|--------|
| `src/pages/MyKpis.tsx` | Add scroll container around main content grid |
| `DOCUMENTATION.md` | Update documentation |

## Technical Changes

### MyKpis.tsx (line 972)

**Current:**
```tsx
{/* Main Content - Grid Layout */}
<div className="flex-1 grid grid-cols-3 gap-4 py-4 min-h-0">
```

**Updated:**
```tsx
{/* Main Content - Grid Layout with Scroll */}
<div className="flex-1 overflow-y-auto min-h-0 py-4">
  <div className="grid grid-cols-3 gap-4">
```

This change:
- Adds `overflow-y-auto` to enable vertical scrolling when content overflows
- Keeps `flex-1` on the outer container to fill available space
- Keeps `min-h-0` to allow the flex child to shrink below its content size
- Separates the scroll container from the grid layout for proper scroll behavior

### Structure Visualization

```text
Before:
+----------------------------------+
| SheetHeader (flex-shrink-0)      |
+----------------------------------+
| Main Content Grid (flex-1)       | <- No scroll, content cuts off
|   [Left] [Middle] [Right]        |
|   ...DailySubmissionSummary...   | <- Hidden/clipped
+----------------------------------+
| SheetFooter (flex-shrink-0)      |
+----------------------------------+

After:
+----------------------------------+
| SheetHeader (flex-shrink-0)      |
+----------------------------------+
| Scroll Container (flex-1)        | <- Scrollable
|   +----------------------------+ |
|   | Grid Content               | |
|   |   [Left] [Middle] [Right]  | |
|   |   ...Daily Summary...      | | <- Viewable via scroll
|   +----------------------------+ |
+----------------------------------+
| SheetFooter (flex-shrink-0)      |
+----------------------------------+
```

## Implementation Details

1. **Line 972**: Change `<div className="flex-1 grid grid-cols-3 gap-4 py-4 min-h-0">` to nested structure with scroll container
2. **Line 1158**: Add closing `</div>` for the new outer container
3. The grid content remains unchanged - just wrapped in a scrollable parent

## Testing Checklist

- Login as Employee
- Navigate to My KPIs
- Open a Daily KPI for review
- Verify the content area is now scrollable
- Scroll down to view the Daily Submission Summary table
- Verify header and footer remain fixed (not scrolling)
- Test with different screen sizes
- Verify non-Daily KPIs still work correctly


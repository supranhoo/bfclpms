
# Fix: Review Timeline Dialog Overflow and Floating Content

## Root Cause

The dialog content overflows its boundary because of a **layout structure problem**:

1. `DialogContent` has `max-h-[85vh]` but the inner wrapper `div.py-2` has **no overflow control**
2. `ScrollArea` uses a **fixed `h-[500px]`** which, combined with the header (~80px), workflow progress (~120px), badges (~40px), and footer (~50px), totals ~790px -- exceeding 85vh on most screens
3. Without `overflow-hidden` on the dialog content, the excess content visually "breaks through" the dialog border and floats below it

Additionally:
- `MANAGER_SENT_BACK_TO_EMPLOYEE` action is missing from `actionConfig`, causing its card to render with an invisible `bg-muted-foreground` dot (CSS variable, not a valid Tailwind bg color)
- The description still shows too much text because `kpi.kpi_name` often has no newlines, so `.split('\n')[0]` returns everything

## Fix Plan

### File: `src/components/dashboard/KpiTimeline.tsx`

**Fix 1 -- Restructure dialog layout for proper overflow containment**

Change the dialog content to use a flex column layout:

```text
DialogContent (max-h-[85vh], flex flex-col, overflow-hidden)
  DialogHeader (shrink-0)
  div (flex-1, min-h-0, flex flex-col, overflow-hidden)
    Workflow Progress (shrink-0)
    Badges (shrink-0)
    ScrollArea (flex-1, min-h-0)  <-- replaces fixed h-[500px]
  Footer (shrink-0)
```

This ensures the ScrollArea dynamically fills available space and the dialog never overflows.

**Fix 2 -- Add missing action config**

Add `MANAGER_SENT_BACK_TO_EMPLOYEE` to `actionConfig` with proper icon and color.

**Fix 3 -- Simplify description**

Show only the KRA name in the description. Remove the raw `kpi_name` dump entirely since it contains formulas and scoring logic.

### File: `DOCUMENTATION.md`

Update to reflect the layout fix and new action config entry.

## Summary

| Fix | Issue | Change |
|-----|-------|--------|
| 1 | Content overflows dialog | Flex column layout with dynamic ScrollArea height |
| 2 | Missing MANAGER_SENT_BACK_TO_EMPLOYEE | Add to actionConfig map |
| 3 | Description shows raw formula text | Show only KRA name |

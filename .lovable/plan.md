

# Move Admin Buttons to Top of KPI Header (Right-Aligned)

## What
Move the "Admin KPI Editor" and "Admin Data Entry" buttons from the badges row inside `KpiHeaderSection` to a dedicated right-aligned row at the very top of the component — visually sitting just below the Sheet/Dialog description, before the category/status badges.

## Approach
Single file change in **`src/components/review/KpiHeaderSection.tsx`**:

1. Extract the admin buttons block from the badges row (lines 128-148)
2. Add a new right-aligned `div` at the top of the component's return, before the existing `bg-muted/30` card — rendering only when `isAdmin` is true
3. The buttons keep their current styling (outline, primary border, small size)

This avoids touching 6+ parent scorecard files since the buttons stay within `KpiHeaderSection` but are visually repositioned above the main card content, appearing on the same visual line as the SheetDescription above.

## File
- **`src/components/review/KpiHeaderSection.tsx`** — Move admin buttons from badge row to a top-level right-aligned row


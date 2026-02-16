

# Fix: Show All KPIs in Data Owners Category List

## Problem

In the Data Owners tab, the KPI list within each category is wrapped in a `ScrollArea` with `max-h-[300px]`. Because the KPI names in this project are very long (multi-line descriptions with formulas and scoring logic), only about 3 KPIs fit in 300px. The remaining KPIs are hidden behind a scroll that isn't visually obvious, making it appear as if KPIs are missing.

## Solution

Remove the fixed height constraint so all KPIs in a category are fully visible without scrolling. Since each category is already inside a collapsible section, there's no need for a nested scroll area -- users expand only the category they want to work with.

## Changes

### File: `src/components/admin/OrgKpiOwnerManagement.tsx`

- Remove the `ScrollArea` wrapper (line 163) and its `max-h-[300px]` constraint
- Replace with a simple `div` so all KPIs render fully visible when the category is expanded

### File: `DOCUMENTATION.md`

- Update to note that the Data Owners tab shows all KPIs without scroll constraints

## Technical Details

| File | Change |
|---|---|
| `src/components/admin/OrgKpiOwnerManagement.tsx` | Replace `ScrollArea className="max-h-[300px]"` with a plain `div` |
| `DOCUMENTATION.md` | Minor doc update |

This is a one-line fix: changing the `ScrollArea` element to a `div` and removing the height cap. Since each category is already collapsible, the user controls visibility by expanding/collapsing sections.

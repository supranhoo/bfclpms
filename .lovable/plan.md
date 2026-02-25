

# Add Data Owner Filter Tiles to Org KPI Data Entry (v1.46.6)

## Overview

Add a row of clickable data owner tiles just below the "Data Entry | Suggestions | Data Owners" tab bar. Each tile shows the owner's name and their completion ratio (e.g., "Biswajit 10/25"), allowing admins to quickly filter KPI cards by a specific data owner. An "All" tile resets the filter.

## Visual Layout

```text
[Data Entry]  [Suggestions]  [Data Owners]       <-- existing tabs

[All (50)]  [Biswajit (10/25)]  [Jaspal (25/25)]  [Vivek (15/15)]   <-- NEW owner tiles
```

- Each tile is a clickable Badge/Button showing: Owner Name (entered/total)
- Active tile is highlighted (default variant), others are outline
- Only visible on the "Data Entry" tab and only when admin
- "All" tile shows aggregate totals and clears the owner filter

## Technical Changes

### 1. Update `OrgKpiDataEntry.tsx`

**New state**: Add `selectedOwnerId` state (string | null, default null).

**Compute owner tiles data**: Using the existing `ownershipMap` and `frequencyFilteredKpis`, build a list of unique data owners with their assigned KPI count and entered count:
- Iterate through `ownershipMap` entries
- For each owner, count total KPIs assigned and how many have values entered
- Produce: `{ ownerId, ownerName, totalKpis, enteredKpis }`

**Filter logic**: When `selectedOwnerId` is set, filter `filteredKpis` to only include KPIs where the selected owner is assigned (via `ownershipMap` lookup).

**UI**: Render the owner tiles row between the Tabs component and the card list, only when `activeTab === 'entry'` and `isAdmin`. Use Badge components matching the existing category pill styling.

### 2. No other file changes needed

All data owner information is already loaded via `useOrgKpiOwnershipMap()`. The filtering is purely client-side.

## Risk Assessment

| Aspect | Risk | Mitigation |
|--------|------|-----------|
| Data impact | None | Read-only, client-side filter |
| Regression | None | Additive UI, existing filter logic untouched |
| Performance | Minimal | Reuses existing ownershipMap data |


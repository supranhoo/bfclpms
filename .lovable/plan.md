

# Improve Completion Visibility on Org KPI Data Entry

## Current Problem

Users cannot easily distinguish completed from pending KPIs because:
- The top progress bar only tracks "entered" vs "not entered" — it ignores "propagated" status
- Individual card status badges (Pending/Entered/Propagated) are small and easy to miss
- There is no way to filter or group cards by status
- Category headers show a simple "X/Y entered" count with no propagation info

## Solution: Multi-Level Status Visibility

### 1. Enhanced Progress Bar with 3-State Tracking

Update `OrgKpiProgressBar` to show three states instead of two:
- **Pending** (grey) — no value entered
- **Entered** (blue/primary) — value saved but not propagated
- **Propagated** (green) — pushed to employee scorecards

Display a segmented progress bar and update the category badges to show all three counts.

### 2. Status Filter Chips

Add filter chips below the progress bar (or next to the search) so users can show:
- **All** (default)
- **Pending** — only cards needing attention
- **Entered** — saved but not yet propagated
- **Propagated** — fully complete

This lets users focus on what still needs work.

### 3. Visual Card Status Indicator

Add a colored left border to each `OrgKpiEntryCard`:
- Pending: `border-l-4 border-l-muted-foreground/30` (grey)
- Entered: `border-l-4 border-l-primary` (blue)
- Propagated: `border-l-4 border-l-green-500` (green)

This gives instant visual scanning without reading badges.

### 4. Category Header Enhancement

Update the category group headers (line 808-814 in OrgKpiDataEntry) to show propagation counts:
- Currently: `3/5 entered`
- New: `2 Pending | 2 Entered | 1 Propagated`

## Technical Changes

### File 1: `src/components/admin/OrgKpiProgressBar.tsx`

- Add `propagatedKpis: number` prop alongside `enteredKpis`
- Add `propagated: number` to `CategoryProgress` interface
- Replace single progress bar with a stacked/segmented bar showing pending (grey), entered (blue), propagated (green)
- Update category badges to show 3-state counts
- Add a legend row: colored dots with labels (Pending / Entered / Propagated)

### File 2: `src/pages/admin/OrgKpiDataEntry.tsx`

- **Progress calculation** (lines 220-260): Track `propagatedKpis` count in addition to `enteredKpis`, by checking `existing?.status === 'propagated'`; add `propagated` to each category's progress
- **New state**: `statusFilter: 'all' | 'pending' | 'entered' | 'propagated'` (default `'all'`)
- **Status filter chips**: Render after the progress bar card — 4 clickable badges showing counts for each status
- **Filter logic**: Apply `statusFilter` to `filteredKpis` before grouping — match card status against filter
- **Category header**: Update the badge from `enteredInCat/total` to show pending/entered/propagated split
- Pass `propagatedKpis` to `OrgKpiProgressBar`

### File 3: `src/components/admin/OrgKpiEntryCard.tsx`

- Add a left border color based on status:
  - `pending` + not N/A: `border-l-4 border-l-muted-foreground/30`
  - `entered`: `border-l-4 border-l-primary`
  - `propagated`: `border-l-4 border-l-green-500`
  - N/A: `border-l-4 border-l-orange-400`

### File 4: `DOCUMENTATION.md`

- Version bump to 1.45.54
- Document: 3-state progress tracking, status filters, card border indicators

## Zero Functionality Lost

All existing features remain: auto-save, propagation, N/A toggles, rollback, unlock, scoped tables, observations panel, bulk fill, import/export, copy from last period.


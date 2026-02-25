

# Fix: HR PMS Badge & Stats Showing Wrong Counts (v1.46.2)

## Problem

On the HR PMS employee selector grid, Debadutta Sahoo shows **"1 reviewed"** but inside the scorecard, that 1 KPI is actually at `hr_pms_review` status -- meaning it's **pending** HR PMS action. Meanwhile, the 8 approved KPIs (which truly passed HR PMS) are not shown at all.

## Root Cause

The HR PMS counting logic in `EmployeeSelectorGrid.tsx` has a labeling/logic mismatch:

| What's counted | Current label | Correct label |
|---|---|---|
| KPIs arriving at HR PMS (preceding stage) | "Pending" | "Pending" |
| KPIs at `hr_pms_review` status | **"Reviewed"** | **"In Review"** (or merge with Pending) |
| KPIs past `hr_pms_review` (audit, approved, etc.) | **Not shown** | **"Reviewed"** |

This mirrors the same pattern that **Audit view already uses correctly** (Pending / In Audit / Forwarded).

## Solution

Align HR PMS with the Audit view's 3-column pattern:

```
Before:  [Total Employees] [Pending Review] [Reviewed]     [Total KPIs]
After:   [Total Employees] [Pending Review] [In Review]    [Reviewed]
```

### Changes in `src/components/review/EmployeeSelectorGrid.tsx`

**1. Stats calculation (lines 393-408)** -- Already correctly calculates 3 values, just need to use all 3:
- `stat1` = pending (arriving at HR PMS) -- keep as-is
- `stat2` = in review (`hr_pms_review` status) -- keep as-is  
- `stat3` = forwarded/reviewed (past HR PMS) -- keep as-is

**2. Stats cards rendering (lines 556-564)** -- Show 4 clickable stat cards instead of 3:
- "Total Employees" (all)
- "Pending Review" (stat1) -- KPIs arriving
- "In Review" (stat2) -- KPIs at hr_pms_review  
- "Reviewed" (stat3) -- KPIs past HR PMS

**3. Employee badges (lines 456-465 and 639-653)** -- Show all 3 badge types:
- `badge1` > 0: "X pending" (rose)
- `badge2` > 0: "X in review" (amber/purple)  
- `badge3` > 0: "X reviewed" (green)

**4. Status filter options (lines 54-58)** -- Add "In Review" option:
```
{ value: 'pending', label: 'Pending HR PMS Review' },
{ value: 'in_review', label: 'In HR PMS Review' },
{ value: 'reviewed', label: 'Reviewed' },
```

**5. Status filtering logic (lines 310-319)** -- Add `in_review` filter branch for `hr_pms_review` status.

### Update `DOCUMENTATION.md`

Bump version and document the HR PMS badge fix.

## Risk Assessment

| Aspect | Risk | Mitigation |
|---|---|---|
| Data impact | None | Read-only display logic |
| Regression | Very low | Only affects HR PMS view badge/stats display |
| Consistency | Improved | Now matches the Audit view's proven 3-column pattern |

## Expected Result After Fix

Debadutta Sahoo's card will show:
- **"1 in review"** (amber badge) for the KPI at `hr_pms_review`
- **"8 reviewed"** (green badge) for the approved KPIs

Stats cards will show accurate "Pending Review", "In Review", and "Reviewed" counts.

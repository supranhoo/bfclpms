
# Plan: Fix KPI Count Display on Dashboard

## Issue

The Dashboard's filter summary text shows an incorrect total count:
- **Current**: "Showing 9 of 18 KPIs for February 2026"
- **Problem**: The "18" is the total KPIs across ALL periods, not just February 2026

This is misleading because the text explicitly says "for February 2026" but the denominator includes KPIs from other months (January, March, etc.).

---

## Root Cause

**File**: `src/pages/Dashboard.tsx` (lines 243-246)

```tsx
Showing <span>{fullyFilteredKpis.length}</span> of{' '}
<span>{kpis?.length || 0}</span> KPIs
for <span>{selectedPeriod} {selectedYear}</span>
```

| Variable | Description | Example Value |
|----------|-------------|---------------|
| `kpis` | ALL user's KPIs across all periods | 18 (includes Jan, Feb, Mar, etc.) |
| `periodFilteredKpis` | KPIs for selected period only | 6 (just February 2026) |
| `fullyFilteredKpis` | Period + category filtered | 3 (February + "HR" category) |

The denominator `kpis?.length` should be `periodFilteredKpis.length` to match the "for February 2026" context.

---

## Solution

Change line 245 from:
```tsx
<span className="font-semibold text-foreground">{kpis?.length || 0}</span>
```

To:
```tsx
<span className="font-semibold text-foreground">{periodFilteredKpis.length}</span>
```

---

## Expected Result

| Scenario | Before | After |
|----------|--------|-------|
| No category filter | "Showing 18 of 18 KPIs for February 2026" | "Showing 6 of 6 KPIs for February 2026" |
| HR category selected | "Showing 9 of 18 KPIs for February 2026" | "Showing 3 of 6 KPIs for February 2026" |

The counts now correctly represent KPIs within the selected period only.

---

## File Changes

| File | Change |
|------|--------|
| `src/pages/Dashboard.tsx` | Line 245: Replace `kpis?.length || 0` with `periodFilteredKpis.length` |

---

## Technical Details

The data flow in the Dashboard component:

```text
kpis (all periods)
    ↓ filter by selectedPeriod + selectedYear
periodFilteredKpis (single month)
    ↓ filter by activeCategory
fullyFilteredKpis (category subset)
```

The fix ensures the "of X" denominator uses `periodFilteredKpis` to match the "for {month} {year}" text.

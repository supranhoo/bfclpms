

## Plan — Make Amount Column Respect the Selected Date Range

### Root Cause

In `src/components/incentive/ProductionDailyGrid.tsx`, the `getTotal(empId)` helper sums **all** values in `localData[empId]` regardless of which date-range chip (1-10 / 11-20 / 21-31) is active. The "Amount" and "Grand Total" both derive from this unfiltered total, so they keep showing the full-month figure even when the grid only displays a partial range.

In your screenshot: Akalu Rajwar has 30 total tons across the month → 30 × ₹503.39 = ₹15,102 shown, even though the visible 11–20 window only contains 13 tons (should be ~₹6,544).

### Fix — Scope Total/Amount to `visibleDays`

Single-file change in `src/components/incentive/ProductionDailyGrid.tsx`:

1. **Update `getTotal`** to accept the active day list and sum only those keys:
   ```ts
   const getTotal = (empId: string, days: number[]): number => {
     const vals = localData[empId] || {};
     return days.reduce((sum, d) => sum + (Number(vals[String(d)]) || 0), 0);
   };
   ```
2. **Pass `visibleDays`** at every call site (row total, amount cell, grand total memo).
3. **Add a header hint** next to "Total" / "Amount" when a partial range is active: e.g. `Total (11–20)` / `Amount (11–20)` so the user knows the figure is range-scoped, not month-scoped.
4. **Grand Total** recomputes from the same range — consistent with the visible columns.

Saving behavior is **unchanged**: the full `daily_values` JSON for the month is still persisted, so switching ranges only changes display math, never stored data.

### Files Changed

| File | Change |
|---|---|
| `src/components/incentive/ProductionDailyGrid.tsx` | Range-aware `getTotal`; update Amount/Grand Total memos; header label reflects active range |
| `DOCUMENTATION.md` | v2.66.7.13 entry — Production Daily Grid Total/Amount honor date-range chip |
| `POLICY.md` | Note: incentive grid totals are display-scoped to the visible date range; persisted data remains full-month |
| `mem://features/incentive/core-engine-specifications` | Append: range chip in `ProductionDailyGrid` scopes Total + Amount + Grand Total to visible days only |

### Risk & Impact Report

- **Data Impact**: None. Pure display math; saved `daily_values` and computed monthly incentives untouched.
- **Workflow Impact**: Positive — values now match what's on screen, removing user confusion.
- **UI/UX**: Header label clarifies scope when a partial range is active; "Full Month" view behaves exactly as before.
- **Regression Risk**: Very low. `getTotal` is only used in this component.
- **Mitigation**: When `dateRange === 'all'`, `visibleDays` covers the whole month so totals are identical to the previous behavior — perfectly backwards-compatible.

### Out of Scope

- Backend monthly incentive computation (always uses full-month sums by design).
- Other incentive tabs (vessel/target/custom) — separate grids, can mirror this pattern later if needed.


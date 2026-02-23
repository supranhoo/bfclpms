

# Bottleneck Report v3 -- Layout & UX Overhaul

## What's Changing

Three targeted improvements to make the report more compact, more granular on urgency thresholds, and easier to navigate by month.

---

## 1. Urgency Distribution: Smaller Panel + New Thresholds

**Current**: Urgency donut takes 50% width (equal to Department chart). Buckets are 0-7d / 8-14d / 15+d.

**New**:
- Change grid to `md:grid-cols-3` with urgency taking 1 column and department chart taking 2 columns
- Shrink urgency chart height from 280px to 200px; use a compact vertical bar or small donut
- Change urgency buckets to **3 days / 5 days / 7+ days**:
  - Green: 0-3 days
  - Amber: 4-5 days  
  - Red: 6+ days (was 15+)
- Update `DaysPendingBadge` component to match new thresholds
- Update `UrgencyStats` computation in the hook

## 2. Month Filter Tiles (above charts)

**New section** placed between summary cards and charts:
- A horizontal row of clickable month tiles (e.g., "Jan 2026", "Feb 2026", "Mar 2026")
- Shows the **3 most recent months** that have data, with left/right chevron arrows to scroll to older months
- Clicking a tile sets `selectedPeriod` + `selectedYear` simultaneously
- An "All" tile to clear the month filter
- Visually styled as compact pill/chip buttons with active state highlight

**Hook changes**: Add `availableMonths` computed from data -- an array of `{ label: string, period: string, year: string }` sorted newest-first. Add `monthWindowStart` state to control which 3 months are visible.

## 3. Top Bottleneck Holders: Updated Thresholds

**Current**: "Critical" column uses 15+ days threshold.

**New**: Match the new urgency thresholds:
- Column headers become: **Pending KPIs | Critical (7+d) | Avg Days**
- Critical count threshold changes from 15 to 7 days (matching the red zone)
- Row highlight triggers at 7+ days critical count instead of 15

## 4. Additional Recommendations (included)

- **Audit/Management split**: Currently combined as one summary card. Split into two separate cards: "Audit" and "Management" -- giving 7 summary cards total, which provides more granular visibility.
- **KRA Set card**: Add a dedicated summary card for `kra_set` stage (KPIs set but employee hasn't started self-review yet) -- this is a blind spot in the current layout.

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/hooks/useBottleneckReport.ts` | Update urgency thresholds (3/5/7), add `availableMonths` + `monthWindowStart` state, update critical threshold to 7d |
| `src/pages/reports/BottleneckReport.tsx` | Add month tile row, resize urgency to 1/3 width, update badge thresholds, split Audit/Management cards, add KRA Set card |
| `DOCUMENTATION.md` | Bump to v1.45.87, document changes |

---

## Technical Details

### Hook: `useBottleneckReport.ts`

```
-- UrgencyStats thresholds change:
   green: daysPending <= 3
   amber: daysPending <= 5
   red:   daysPending >= 6

-- New: availableMonths
   Derived from allRows, deduplicated by (period + year),
   sorted newest-first. Returns { label: "Feb 2026", period: "February", year: "2026" }[]

-- New state: monthWindowStart (default 0)
   Controls which slice of 3 months is shown in the tile bar.

-- TopHolders: criticalCount threshold changes from >14 to >=7
```

### Page: `BottleneckReport.tsx`

```
-- New section between summary cards and charts:
   Month tile bar with < [Month1] [Month2] [Month3] > navigation
   Clicking a month sets selectedPeriod + selectedYear
   "All" pill clears both

-- Chart grid changes from md:grid-cols-2 to md:grid-cols-3
   Urgency chart: col-span-1, height 200px
   Department chart: col-span-2, height 280px (unchanged)

-- Summary cards: 7 cards in a row
   Total | KRA Set | Self Review | Manager | Skip-Level | HR PMS | Avg Days
   (Audit + Management accessible via stage filter dropdown only)

-- DaysPendingBadge: green <=3d, amber 4-5d, red 6+d
```

## Risk Assessment

| Aspect | Detail |
|--------|--------|
| Data impact | None -- read-only, threshold changes only |
| Regression risk | Low -- only modifying bottleneck report files |
| UI consistency | Follows existing tile/chip patterns from other pages |

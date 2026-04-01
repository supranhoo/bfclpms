

## Plan: Compact Previous Months Display & Remove Blank Space

### Problems
1. "Overall Performance" text above donut is redundant — remove it
2. Previous months display is vertical, taking too much space — switch to horizontal single row showing 3 months
3. When few categories exist, the Performance by Category card leaves blank space below

### Changes

**1. `src/components/review/UnifiedScorecard.tsx`**
- Remove `CardHeader` with "Overall" / "Performance" from the left card — the donut chart is self-explanatory
- Change previous months count from 2 → 3
- Make the category chart height dynamic: use `min-height` instead of fixed height so it doesn't create blank space. Change `style={{ height: ... }}` to `style={{ minHeight: ... }}` on the category card content

**2. `src/components/review/PreviousMonthsScoreMini.tsx`**
- Accept a `count` prop (default 3) instead of hardcoded 2
- Redesign layout from vertical stacked rows to a **horizontal single row**:

```text
Previous Months
┌──────────┬──────────┬──────────┐
│ Feb 2026 │ Jan 2026 │ Dec 2025 │
│  100.0%  │  99.4%   │  95.2%   │
│  5.00/5 ↗│  4.97/5 ↘│  4.76/5 ↘│
└──────────┴──────────┴──────────┘
```

- Each month in a compact column: month label, percentage (color-coded), score, trend icon
- Remove progress bars to save vertical space
- Use `grid grid-cols-3` layout — fits mobile since each column is narrow text only

**3. `DOCUMENTATION.md`** — v2.15.55

### Files Modified

| File | Change |
|------|--------|
| `src/components/review/PreviousMonthsScoreMini.tsx` | Horizontal 3-month layout, remove progress bars |
| `src/components/review/UnifiedScorecard.tsx` | Remove "Overall/Performance" header, pass count=3, fix category chart height |
| `DOCUMENTATION.md` | v2.15.55 |

### Risk
- Low — purely visual/layout changes, no business logic affected


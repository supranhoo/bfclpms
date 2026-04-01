

## UI/UX Design: Previous 2 Months' Overall Scores on Dashboard

### Current Layout Analysis
The dashboard has a **1:5 grid** — a small "Overall Performance" card (1/6) with the donut chart + weighted score, and a wide "Performance by Category" card (5/6).

### Recommended Placement: Inside the Existing "Overall" Card

Add a compact **mini trend strip** below the existing "Weighted Score" section in the Overall Performance card. This is the most natural location because:
- It keeps all "overall score" information grouped together
- No additional cards or layout disruption
- Works on mobile since this card already stacks full-width

### Visual Design

```text
┌─────────────────────┐
│  Overall             │
│  Performance         │
│                      │
│    ┌──────────┐      │
│    │  94.4%   │      │  ← existing donut
│    │  4.72/5  │      │
│    └──────────┘      │
│                      │
│  Weighted Score      │
│  401.0 / 425         │
│ ─────────────────── │
│  Previous Months     │  ← NEW section
│                      │
│  Feb 2026   91.2%    │  ← compact row with
│  ████████░░  4.56/5  │    mini progress bar
│                      │
│  Jan 2026   88.0%    │
│  ███████░░░  4.40/5  │
│                      │
└─────────────────────┘
```

Each previous month row shows:
- **Month label** (e.g., "Feb 2026")
- **Percentage** with a thin colored progress bar (color-coded: green/yellow/red based on rating)
- **Rating** (e.g., 4.56/5) in smaller muted text
- **Trend arrow** (↑/↓) comparing to current month

### Mobile Behavior
- On mobile, the Overall card is already full-width, so the mini rows fit naturally
- Progress bars scale with container width
- Text stays at `text-xs` for compactness

### Why Not Other Options?

| Alternative | Why Not |
|---|---|
| Separate card row above | Adds vertical clutter, pushes KPI Details down |
| Tabs inside the card | Over-engineered for just 2 data points |
| Tooltip on hover | Not mobile-friendly, hidden information |
| Inline next to donut | Too cramped on small screens |

### Technical Approach

**1. `src/components/review/UnifiedScorecard.tsx`**
- After the existing weighted score block (line ~1388), add a "Previous Months" section
- Fetch previous 2 months' KPIs + submissions using the same pattern as `KpiJourneySection` (match by employee, KPI name, KRA name)
- Calculate weighted averages using the standard 8-stage fallback chain
- Display as compact rows with mini progress bars

**2. Create `src/components/review/PreviousMonthsScoreMini.tsx`**
- Receives `employeeId`, `currentMonth`, `currentYear`, `reviewPeriodId`
- Fetches and computes scores for the 2 prior months
- Renders the compact strip UI
- Uses `staleTime: 5min` to avoid redundant fetches

**3. `DOCUMENTATION.md`** — v2.15.54

### Files Modified

| File | Change |
|---|---|
| `src/components/review/PreviousMonthsScoreMini.tsx` | New — compact previous months display |
| `src/components/review/UnifiedScorecard.tsx` | Mount the new component inside Overall card |
| `DOCUMENTATION.md` | v2.15.54 |


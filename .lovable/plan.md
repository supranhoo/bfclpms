

## Plan: Simplify Previous Months Score Display

### Current UI
```text
Feb 2026    Jan 2026    Dec 2025
100.0%      99.4%       N/A
5.00/5 ↘    4.97/5 ↘    
```

### Proposed UI
```text
Previous Months
┌──────────┬──────────┬──────────┐
│ Feb 2026 │ Jan 2026 │ Dec 2025 │
│   5.00   │   4.97   │   N/A    │
└──────────┴──────────┴──────────┘
```

Each month shows only: **month label** + **score** (color-coded green/yellow/red). No percentage, no "/5", no trend arrows.

### Changes

**`src/components/review/PreviousMonthsScoreMini.tsx`**
- Remove percentage display line
- Remove trend arrow icons (TrendingUp, TrendingDown, Minus imports)
- Show only `r.score.toFixed(2)` with color coding
- Remove `/5` suffix

**`DOCUMENTATION.md`** — v2.15.57

| File | Change |
|------|--------|
| `src/components/review/PreviousMonthsScoreMini.tsx` | Strip %, /5, arrows |
| `DOCUMENTATION.md` | v2.15.57 |


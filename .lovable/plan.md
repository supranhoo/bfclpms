

# Replace Rating Histogram with Bell Curve Visualization

## What We Will Build

Replace the current bar chart with a smooth bell curve (area chart) that plots the 5-band rating distribution as a continuous curve, with colored zones under the curve for each performance band.

## Changes

### 1. New File: `src/components/management/RatingBellCurve.tsx`

Create a new component using Recharts `AreaChart` with `type="monotone"` to render a smooth bell curve:

- **X-axis**: The 5 score bands plotted left-to-right (Below < 3, Needs Imp 3-3.5, Meets 3.5-4, Exceeds 4-4.5, Outstanding 4.5-5)
- **Curve**: Smooth `Area` with `type="monotone"` or `"basis"` interpolation showing employee counts
- **Gradient fill**: Use a `linearGradient` under the curve transitioning through the 5 band colors (red → orange → yellow → blue → green)
- **Reference line**: Show the mean score as a vertical dashed reference line
- **Stats subtitle**: Display Mean and Std Dev below the title
- **Legend**: Keep the 5-band legend with employee counts at the bottom

Props: `data` (same `RatingBand[]`), plus new `meanScore` and `stdDev` numbers.

### 2. Modify `src/pages/ManagementDashboard.tsx`

- **Compute mean & stdDev** from `employeeScoreMap` after the bucketing loop (~line 313). Collect all avg scores into an array, compute mean and standard deviation.
- **Add `meanScore` and `stdDev`** to the returned data object (~line 395).
- **Swap import** from `RatingHistogram` to `RatingBellCurve`.
- **Update JSX** (~line 642) to render `<RatingBellCurve>` passing `data`, `meanScore`, `stdDev`.

### 3. Keep `src/components/management/RatingHistogram.tsx`

Leave the file as-is for potential future use (toggle between views), but it will no longer be imported on the dashboard.

## Visual Layout

```text
┌──────────────────────────────────────┐
│  📊 Rating Distribution (Bell Curve) │
│  Mean: 3.8  |  Std Dev: 0.6         │
│                                      │
│           ╱‾‾╲                       │
│          ╱    ╲                      │
│        ╱       ╲                     │
│      ╱    ↑     ╲                    │
│    ╱    mean      ╲                  │
│  ╱                  ╲                │
│ ╱────────────────────╲───            │
│ Red  Orange  Yellow  Blue  Green     │
│                                      │
│ 🔴 Below: 12  🟠 Needs: 45          │
│ 🟡 Meets: 89  🔵 Exceeds: 34        │
│ 🟢 Outstanding: 8                   │
└──────────────────────────────────────┘
```

## Risk Assessment
- No schema or DB changes -- purely UI/calculation logic
- Low regression risk -- isolated to one chart on management dashboard
- `RatingHistogram` preserved if toggle is desired later


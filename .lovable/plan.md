## Problem

The PIP threshold in **Admin → Scoring → PIP Threshold** is honoured only in two places on the Monthly Scorecard Trend report:

1. The "Show PIP candidates only" toggle.
2. The "N PIP candidates" summary card + Excel sheet.

Everywhere else (monthly cells, AVG cell), scores are coloured with a **hardcoded** rule in `MonthlyTrendTable.tsx`:

```ts
const pct = (score / 5) * 100;
if (pct >= 80) green;       // score ≥ 4.0
else if (pct >= 60) yellow; // score ≥ 3.0
else red;
```

So after the admin sets PIP = 2.00, an employee with 3.17 avg is still painted **amber/red** even though they are clearly above the PIP line. The report visually contradicts the configured threshold — this is what the user is reporting as "not showing data as per threshold".

The PIP-only filter itself is working correctly: with all employees ≥ 3.17 and threshold = 2, the candidate count is genuinely 0.

## Fix

Drive the score colouring from the configured PIP threshold instead of hardcoded 3.0 / 4.0 cutoffs.

### `src/components/reports/MonthlyTrendTable.tsx`

- Replace `scoreClass(score)` with `scoreClass(score, pipThreshold)`:
  - `null` → muted
  - `score < pipThreshold` → red (destructive) — PIP zone
  - `score < pipThreshold + 0.5` → amber — watch zone (fallback amber band just above threshold, capped at 5)
  - otherwise → green
  - When `pipThreshold` is null/undefined, keep the current 4.0 / 3.0 fallback so nothing changes for legacy callers.
- Pass `pipThreshold` into `scoreClass` for both monthly cells and the AVG cell.
- Keep the existing row tint (`isPip` background) unchanged.

### `src/components/reports/MonthlyTrendView.tsx`

- Already computes `pipThreshold` and already passes it to `MonthlyTrendTable`. No change required beyond ensuring the prop reaches the table (it already does on line 390).
- Update the PIP callout copy to make the linkage explicit: colour legend line under the table — "Red = below PIP threshold ({threshold}); Amber = within 0.5 of threshold; Green = safe."

### Tests

Add `src/test/monthlyTrendScoreClass.test.ts`:

- threshold=2 → 1.9 red, 2.0 green (boundary is strict `<`), 2.4 amber, 2.6 green
- threshold=null → falls back to legacy 3.0 / 4.0 bands
- null score → muted regardless of threshold

## Not changed

- `useMonthlyTrend` hook, PIP candidate math, Excel export, PIP filter toggle — all already correct.
- Admin PIP Threshold card and `pmsSettings.ts` — already correct.
- No DB, RLS, or migration change.

## Risk

- Low. Pure presentational change scoped to one component + one helper. Existing behaviour preserved when `pipThreshold` is unavailable.
- Regression guard: unit tests for `scoreClass` cover both threshold and legacy branches.

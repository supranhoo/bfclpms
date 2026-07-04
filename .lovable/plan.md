# Fix: Weekly KPI Submit Month is unreachable after month-end

## Assumptions
- Policy (per your answer): the moment the review month ends, all weeks of that month are considered "over with the month" and their data must remain enterable during the next month, effective from the 1st.
- Current behavior we're changing lives entirely in the frontend period generator; DB schema, RLS, and mutations remain untouched.
- Week 5 (for 29/30/31) already uses a next-month window (`week_5` in `frequency_config.review_window_rules`). We reuse that window as the "carry-over" period for Weeks 1–4.

## Root Cause (verified)
`src/lib/frequencyUtils.ts → getWeeklySubPeriods`:
```
isInWindow = currentMonth === reviewMonth && currentYear === reviewYear && day in window
```
For June 2026 viewed on 04-Jul-2026: `currentMonth = 'July' ≠ 'June'` → Weeks 1–4 are all `isEnabled=false`.
Downstream:
- `SubPeriodSelector` renders "No weeks are currently open for review" → user cannot pick a week → **Save Entry stays disabled**.
- With `selectedKpiSubPeriods.length === 0` in `SelfReviewSheet.tsx`, **Submit Month** shows the tooltip *"Enter at least one weekly value first"* and remains disabled — even though the month has ended.

Confirmed against DB for KPI `0d698b37-cafa-46dc-9502-8c19f06ae830` (Vivek Kumar Tripathi, June-26, Weekly): `sub_period_submissions` → 0 rows.

## Risk & Impact Report
- **Data**: none. No schema/RLS change. Uses existing `week_5` window already stored in `frequency_config.review_window_rules`.
- **Workflow**: identical — user must still Save at least one week before Submit Month; only the *when* changes.
- **UI/UX**: Weeks 1–4 for a completed month become selectable during the next-month window (default Week 5 window, e.g. 1st–5th). No visual redesign.
- **Regression risk**: Low. Change is limited to the enabled/disabled predicate in one function; existing daily behavior and locked-month gating are untouched. Existing tests in `src/lib/weeklyWindowsResolution.test.ts` and `frequencyUtils.test.ts` guard current behavior — we'll extend them.
- **Scalability**: no query change; purely date arithmetic in the browser.
- **Mitigation**: new unit tests cover (a) June viewed in July 1–5 → Weeks 1–4 enabled; (b) June viewed in July 6+ → Weeks 1–4 disabled again; (c) June viewed in June → unchanged; (d) Week 5 unchanged; (e) custom window overrides honored.

## Plan (surgical)

1. **`src/lib/frequencyUtils.ts` → `getWeeklySubPeriods`**
   - For Weeks 1–4, compute a second window in the *next* month using `windows.week_5` (or `windows.week_carryover` if present as a future override). Enable a week when *either* the in-month window (existing) OR the next-month carry-over window is active.
   - Week 5 logic is unchanged.
   - No new hardcoded values — reuses configured windows.

2. **`src/lib/frequencyUtils.test.ts` / `src/lib/weeklyWindowsResolution.test.ts`**
   - Add cases:
     - `getWeeklySubPeriods(new Date('2026-07-02'), 'June', 2026)` → Weeks 1–4 `isEnabled: true`.
     - `getWeeklySubPeriods(new Date('2026-07-10'), 'June', 2026)` → Weeks 1–4 `isEnabled: false` (grace elapsed).
     - `getWeeklySubPeriods(new Date('2026-06-15'), 'June', 2026)` → only current week enabled (regression guard).

3. **`src/modules/annual-review/…` DOCUMENTATION.md / POLICY.md** *(Not Applicable — this is the monthly PMS module.)* Instead:
   - **`src/modules/pms/DOCUMENTATION.md`** (or the closest existing PMS doc; will confirm on the first read) — add a "Weekly carry-over window" section under Sub-Period Submissions.
   - **`src/modules/pms/POLICY.md`** — add the rule: *"When the review month ends, all Weeks 1–5 of that month remain enterable during the configured carry-over window in the following month (default: `week_5` window). Submit Month remains gated by ≥1 saved weekly entry."*

4. **No change** to `SelfReviewSheet.tsx` gating, `isMonthStillActive`, `isCycleComplete`, RLS, or mutations. The Submit Month button naturally lights up once the user Saves the first back-filled week.

## UI Changes
- **Where**: Self Review sheet → "Weekly KPI – Submit data for each week" purple panel → week picker.
- **What visually**: for a completed month viewed within the carry-over window, Weeks 1–4 no longer show the "Closed" badge; they become selectable with the normal week label (`Week N (1-7 Jun)` etc.). The green ✓ still marks weeks already submitted.
- **Interaction impact**: user can now select and Save weekly values for the just-ended month during the first days of the next month; Submit Month enables as soon as one week is saved.
- **Responsiveness**: unchanged (same component).

## Post-implementation notes
- If the grace window needs to differ from Week 5's window, admins can add a `week_carryover` entry in `frequency_config.review_window_rules` — code will pick it up without a redeploy.
- Rollback: revert the one function; no data written.

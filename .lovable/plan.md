## Risk & Impact Report

- **Data Impact**: No schema change. `frequency_config.review_window_rules` (JSONB) already exists for the `Weekly` row; only its values are widened. Historical sub_period_submissions are untouched.
- **Workflow Impact**: Employees gain a wider window to log Weekly KPIs. Manager/auditor/management stages unaffected. No RLS changes.
- **UI/UX**: SubPeriodSelector and WeeklySubmissionTable will show more enabled weeks at once (the most recently completed week stays available until the next one closes). Admin gets a new editor.
- **Regression Risk**: Low. The two existing call sites (`getWeeklySubPeriods`, `canSubmitForSubPeriod` case `'Weekly'`) read the same constant; switching to a single shared helper avoids drift. Daily logic and multi-month logic are not touched.
- **Mitigation**: New unit tests cover dead-zone scenarios for May 19/20/21 and month-boundary Week 5. The `frequency_config` row is updated via migration so existing tenants get the widened windows immediately; defaults in `WEEKLY_REVIEW_WINDOWS` (used as fallback when DB is absent) are widened in lockstep.

## Root Cause Recap

`getWeeklySubPeriods()` and `canSubmitForSubPeriod()` both use the hardcoded `WEEKLY_REVIEW_WINDOWS` map: Week 2 closes day 18 and Week 3 opens day 22. Days 19–21 are dead — the picker shows "No available periods" so the employee cannot submit. The DB has the same windows in `frequency_config.Weekly.review_window_rules`, currently unread by the helper.

## Plan

### 1. Database — widen Weekly windows (migration update of seed row)

Update the `Weekly` row's `review_window_rules` to remove gaps. New windows mean "you can log Week N from the day after Week N ends until Week N+1's window closes":

```text
week_1: days  8–14         (was 8–10)
week_2: days 15–21         (was 15–18)
week_3: days 22–28         (was 22–24)
week_4: days 29–end-of-month (was 29–31)
week_5: days  5–14 next month (was 5–8 next month)
```

### 2. Hook — expose Weekly windows reactively

In `src/hooks/useFrequencyConfig.ts`, add `useWeeklyReviewWindowsResolved()` that returns the parsed `Record<week_key, {start, end, next_month?}>` from the Weekly config row, normalised to the same shape as `WEEKLY_REVIEW_WINDOWS`. Falls back to the hardcoded constants if the row is missing.

### 3. Helper refactor — `src/lib/frequencyUtils.ts`

- Add optional `windowsOverride?: Record<string, WeeklyReviewWindow>` parameter to:
  - `getWeeklySubPeriods(currentDate, reviewMonth, reviewYear, windowsOverride?)`
  - `canSubmitForSubPeriod(...)` Weekly branch
- Both fall back to `WEEKLY_REVIEW_WINDOWS` constants when no override is passed (keeps unit tests and any non-hook callers working).
- Widen the hardcoded `WEEKLY_REVIEW_WINDOWS` constants to match the new DB defaults so SSR/test environments stay consistent.

### 4. Wire the override at call sites

- `src/components/review/SubPeriodSelector.tsx`: call `useWeeklyReviewWindowsResolved()` and pass to `getWeeklySubPeriods`.
- `src/components/review/WeeklySubmissionTable.tsx`: same — use resolved windows for the per-row "Closed" badge and submit-disabled logic.
- Any save-path call to `canSubmitForSubPeriod` for Weekly: pass the resolved windows so the client-side guard matches the picker.

### 5. Admin UI — make Weekly windows editable

Extend `src/components/admin/FrequencyCycleSettings.tsx` with a new `WeeklyWindowEditor` card:

- One row per week (1–5) with two number inputs (start day, end day) plus a "next month" checkbox for Week 5.
- Validates: `1 ≤ start ≤ end ≤ 31`, weeks 1–4 must not have `next_month`, Week 5 must.
- Saves via new mutation `useUpdateWeeklyReviewWindows()` in `useFrequencyConfig.ts` that patches only `review_window_rules` on the Weekly row.
- Renders read-only preview: "Week 2 — open May 15 to May 21".

### 6. Tests

New: `src/lib/weeklyWindowsResolution.test.ts`
- May 19, 2026 with widened defaults → Week 2 enabled, Week 3 disabled. (Currently both disabled — regression for Jyoti's bug.)
- May 22 → Week 2 still enabled (within its 15-21 window? No — 22 > 21, so Week 2 disabled, Week 3 enabled). Adjust assertion to "exactly one week always enabled in days 8-end".
- Custom override (admin-edited windows) is honored by both `getWeeklySubPeriods` and `canSubmitForSubPeriod`.
- Month-boundary: June 3 with reviewMonth=May should enable Week 5 (5–14 next month) for May.

Existing tests in `src/lib/frequencyUtils.test.ts` updated to reflect new default windows (and a `WHY` comment pointing to this plan).

### 7. Documentation

- `DOCUMENTATION.md` and `POLICY.md`: add §“Weekly Review Windows — DB-driven” entry under Frequency Policy, with table of new defaults and admin-edit instructions.
- `mem://features/admin/dynamic-working-days-config` mentions Daily; create sibling memory `mem://features/admin/weekly-review-windows-config` summarising the new contract and the Jyoti RCA.

## Out of Scope

- Daily window logic (already configurable via `useDailySubmissionWindow`).
- Multi-month cycle locking (`isKpiLockedForPeriod`).
- Backfilling missed submissions for days 19–21 of past months — admins can use existing Admin Data Entry path.

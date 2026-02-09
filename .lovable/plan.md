

# Unit & Component Test Implementation Plan

## Current State
- 3 test files exist: `ratingCalculation.test.ts` (110+ tests), `inboxSearchParser.test.ts` (8 tests), `textFormatting.test.ts`
- Vitest + React Testing Library fully configured
- No component or hook tests yet
- Playwright/E2E is not available in this environment, so Phase 3 is skipped entirely

## Strategy
Focus on pure business logic (highest ROI, no mocking complexity) and lightweight component rendering tests. This gets us to ~70% coverage on critical paths without fragile infrastructure mocks.

## Phase 1: Critical Path Logic Tests (Pure Functions)

### 1a. `src/lib/dailyAggregation.test.ts` (~25 tests)
Test all exported functions:
- `getExpectedDaysInMonth` -- returns correct days for each month
- `calculateAverageScore` -- empty array, single value, multiple values
- `calculateMissedDaysPenaltyScore` -- 0 missed through 5+ missed
- `calculateBinaryDailyScoreWithExpectedDays` -- all Yes, all No, mixed, missed days
- `calculateBinaryDailyScore` -- backwards-compatible wrapper
- `calculateDailyAggregatedScoreWithExpectedDays` -- dispatches correctly to average vs penalty methods

### 1b. `src/lib/cumulativeScoring.test.ts` (~20 tests)
- `calculateCumulativeScore` -- empty, single score, weighted average, simple average, mixed null scores
- `calculateTrend` -- improving, declining, stable, fewer than 2 data points, null handling
- `calculateTrendFromPeriodScores` -- chronological sorting, cross-year ordering

### 1c. `src/lib/frequencyUtils.test.ts` (~15 tests)
- `getMonthNumber` -- all 12 months
- `getSubPeriodOptions` -- for Daily, Weekly, Monthly, Quarterly, Half-Yearly, Yearly frequencies
- Edge cases for cycle boundaries (Bi-Monthly, Quarterly review months)

### 1d. `src/lib/inboxUtils.test.ts` (~20 tests)
- `groupByDate` -- today items, this-week items, earlier items, empty input
- `formatRelativeTime` -- today timestamps, older timestamps
- `getNotificationTypeLabel` -- known types, unknown fallback
- `getQueryStatusClasses` -- all 3 statuses
- `getQuickAction` -- open query for target user, responded query for raising user, non-query items, wrong user
- `getItemSlaStatus` -- on-time, at-risk, overdue, resolved queries, non-query items
- `filterInboxItems` -- text search, dropdown filters, snoozed item exclusion, combined filters

### 1e. `src/lib/importValidation.test.ts` (~10 tests)
- `normalizeRole` -- valid roles, invalid input, null/undefined, case insensitivity
- `KpiImportRowSchema` -- valid row passes, missing required fields fail, boundary values

### 1f. `src/lib/dateUtils.test.ts` (~5 tests)
- `formatDate` -- string input, Date object input
- `formatDateTime` -- correct format with AM/PM

## Phase 2: Component Rendering Tests

### 2a. `src/components/inbox/InboxTable.test.tsx` (~8 tests)
- Renders loading spinner when `isLoading=true`
- Renders empty state with custom message when `items=[]`
- Renders rows for provided items
- Renders grouped headers when `enableGrouping=true`
- Renders "Load More" button when `hasMore=true`
- Calls `onViewItem` when view button clicked

### 2b. `src/components/inbox/SnoozePopover.test.tsx` (~5 tests)
- Renders snooze trigger button
- Shows preset options on click (1 Hour, 4 Hours, Tomorrow, Next Monday)
- Calls `onSnooze` with correct Date for each preset
- Shows loading state when `isLoading=true`

### 2c. `src/components/ui/ErrorBoundary.test.tsx` (~4 tests)
- Renders children normally when no error
- Renders error fallback when child throws
- Renders custom fallback when provided
- "Try Again" button resets error state

## What's NOT Included (and why)
- **Hook tests (useKpis, useNotifications, etc.):** These are thin Supabase query wrappers. Testing them requires mocking the Supabase client, auth context, and React Query -- high effort, low value since the actual logic lives in the `lib/` functions.
- **E2E/Playwright tests:** No Playwright runner is available in this environment. The component tests with mock data provide the UI validation layer instead.

## File Summary

| File | Type | Est. Tests |
|------|------|-----------|
| `src/lib/dailyAggregation.test.ts` | New | ~25 |
| `src/lib/cumulativeScoring.test.ts` | New | ~20 |
| `src/lib/frequencyUtils.test.ts` | New | ~15 |
| `src/lib/inboxUtils.test.ts` | New | ~20 |
| `src/lib/importValidation.test.ts` | New | ~10 |
| `src/lib/dateUtils.test.ts` | New | ~5 |
| `src/components/inbox/InboxTable.test.tsx` | New | ~8 |
| `src/components/inbox/SnoozePopover.test.tsx` | New | ~5 |
| `src/components/ui/ErrorBoundary.test.tsx` | New | ~4 |
| `DOCUMENTATION.md` | Update | -- |

**Total: ~112 new tests across 9 files** (bringing overall total to ~280+ tests)

No database changes or new dependencies required.


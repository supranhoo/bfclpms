

# Impact Check: Recent Governance Changes & Gaps

## Changes Made
1. **Completion percentage fix** — Dynamic calculation from KPI statuses (`approved/total * 100`) in `ReviewPeriods.tsx` and `ReviewPeriodStatusWidget.tsx`; removed misleading `|| progressPct` fallback in `ReviewPeriodOverview.tsx`
2. **Auto-lock label fix** — Clarified "days" to "days from stage start date" in `ReviewPeriodAutoRules.tsx`
3. **DOCUMENTATION.md** — Added full governance section

## Impact Assessment

### No Issues Found
- **ReviewPeriods.tsx** — Already computes `completion_percentage` dynamically from KPI data; passes it correctly to `ReviewPeriodOverview`
- **ReviewPeriodStatusWidget.tsx** — Same dynamic calculation; renders correctly via `<Progress>` and text
- **ReviewPeriodOverview.tsx** — Now shows only `period.completion_percentage` (line 72-73), no fallback. The `progressPct` variable on line 36 is still computed but **never used** — dead code

### Issues Found

| # | Issue | Severity | File |
|---|-------|----------|------|
| 1 | **Dead code**: `progressPct` variable (line 36) is computed but never referenced after the fallback removal | Low | `ReviewPeriodOverview.tsx` |
| 2 | **Test uses stale data**: `ReviewPeriodOverview.test.tsx` sets `completion_percentage: 0` — the test still passes because nothing asserts on the completion value, but the test should verify the completion card renders the correct percentage | Medium | `ReviewPeriodOverview.test.tsx` |
| 3 | **Period key splitting bug**: `ReviewPeriods.tsx` line 79 splits the key with `-`, but period names like "January" don't contain `-`. The split `key.split('-')` on a key like `January-2026` yields `['January', '2026']` — this works. However, if a period name ever contained `-` (e.g. "H1-2026" as a name with year 2026 → key "H1-2026-2026"), the split would break. Currently safe since period names are month names, but fragile | Low | `ReviewPeriods.tsx` |

## Proposed Fixes

### 1. Remove dead `progressPct` variable
Delete line 36 in `ReviewPeriodOverview.tsx` — the stage pipeline visualization already handles stage progress visually without needing this computed value.

### 2. Add completion percentage test assertion
Update `ReviewPeriodOverview.test.tsx` to set `completion_percentage: 65` in mock data and assert `65%` renders in the UI. This validates the fix works and prevents regression.

### 3. No action on key splitting
The period names come from month names only. Document as a known limitation but no code change needed.

## Files to Modify
- `src/components/admin/ReviewPeriodOverview.tsx` — remove dead `progressPct` line
- `src/components/admin/ReviewPeriodOverview.test.tsx` — add completion percentage assertion

## No database, RLS, or edge function changes needed


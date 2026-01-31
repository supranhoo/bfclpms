# Plan: Fix "Submit Month" Button Not Visible for Employees

## Status: ✅ COMPLETED

## Root Cause
Race condition where `subPeriodSubmissions` was undefined during initial render, causing `selectedKpiSubPeriods.length === 0` to always be true when the sheet opened.

## Fixes Applied

1. **Added loading state** - `subPeriodLoading` from the hook
2. **Fixed stale closure** - Wrapped `getKpiSubPeriodSubmissions` in `useCallback`
3. **Updated dependencies** - `selectedKpiSubPeriods` now depends on memoized function
4. **Added loading indicator** - Shows spinner while data loads
5. **Added Loader2 import** - For the loading spinner icon

## Files Modified
- `src/pages/MyKpis.tsx` - Fixed loading state, memoization, button rendering
- `DOCUMENTATION.md` - Updated button visibility table


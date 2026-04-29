## Risk & Impact Report

**Symptom:** Date Range (Trend) tab shows "93 of 93 employees" but every monthly cell is "—".

**Root Cause (RCA):**
Two compounding problems, only one of which the previous patch addressed.

1. **Original silent failure (already patched).** `useMonthlyTrend` was issuing submission batches of **800 KPI IDs** per `kpi_id=in.(...)` URL (~30 KB). PostgREST rejected those URLs with 414 / connection-reset, and the old code did `r.data ?? []` with no `r.error` check, so every submission silently came back empty → all dashes. We reduced `SUB_BATCH` to 200 and now throw on `r.error`.

2. **Stale cached result is still being shown (the live problem).** React Query already cached the *broken* result (`{employees: 93 rows of all-null scores}`) under key `['monthly-trend', fromMonth, fromYear, toMonth, toYear, includeInactive, profilesVersion]` with `staleTime: 5 * 60_000` and `gcTime: 10 * 60_000`. The user’s "Reload" click only sets `requestedRange` to the same values → same query key → React Query returns the cached payload without refetching. Network snapshot confirms zero `review_period=in.(...)` calls fired this session — only unrelated single-employee fetches.

**Data Impact:** None. Read-only report; no schema/RLS changes.
**Workflow Impact:** None.
**UI/UX Impact:** Reload now actually reloads. No visual changes.
**Regression Risk:** Low. Change is scoped to `useMonthlyTrend` + `MonthlyTrendView`’s reload handler. Existing tests (`multiMonthBannerCopy`, `frequencyUtils`) untouched.
**Mitigation:** Add a unit test asserting that `handleLoad` invalidates/refetches even when filters are unchanged. Add a console.warn when a fetched batch comes back empty so future regressions are visible.

---

## Plan

### 1. `src/components/reports/MonthlyTrendView.tsx` — make Reload always refetch
- Pull `queryClient` from `useQueryClient()`.
- In `handleLoad()`, after `setRequestedRange(...)`, call:
  ```ts
  queryClient.invalidateQueries({ queryKey: ['monthly-trend'] });
  ```
  This forces React Query to refetch the trend even when the filter values are identical to the cached run (which is exactly what's happening now after the hot-fix).
- No change to any other tab or hook.

### 2. `src/hooks/useMonthlyTrend.ts` — diagnostics + cache safety
- Lower `staleTime` from `5 * 60_000` → `30_000` so users naturally get fresh data after navigating away and back. Keep `gcTime` at 5 min.
- Already throws on `r.error`. Add a one-line `console.warn` if `allKpis.length > 0 && subMap.size === 0` (KPIs returned but submissions came back empty) so any future regression of this exact bug is loud.
- Confirm `SUB_BATCH = 200` and `PAGE = 1000` are still in place (already patched).

### 3. Test — `src/test/monthlyTrendCacheBust.test.ts`
- Render `MonthlyTrendView` with a stubbed `useMonthlyTrend`. Assert that clicking Reload triggers `queryClient.invalidateQueries` for `['monthly-trend']`. Also cover the “no-op when range invalid” path.

### 4. Documentation sync (mandatory per project SSOT rule)
- `POLICY.md` — under reporting policies, add a sentence: *"Manual-reload buttons on cached reports MUST invalidate their query keys; toggling state alone is not sufficient because React Query returns cached data when the key is unchanged."*
- `DOCUMENTATION.md` — version-history entry: "Fixed Monthly Scorecard Date-Range trend showing stale all-null rows after a failed first fetch."
- `mem/index.md` + new `mem/features/reports/monthly-scorecard-trend.md` — record the cache-bust contract and the 200-ID submission batch ceiling (URL-length safety).

### 5. User-side step (one-time)
The user's browser has the bad cached result for the **current React Query memory only** — a hard refresh or navigating away from the report tab and back will clear it. After this fix the Reload button alone will be enough.

---

## Files touched
- `src/components/reports/MonthlyTrendView.tsx` (edit)
- `src/hooks/useMonthlyTrend.ts` (edit — staleTime + diag warn)
- `src/test/monthlyTrendCacheBust.test.ts` (new)
- `POLICY.md`, `DOCUMENTATION.md`, `mem/index.md`, `mem/features/reports/monthly-scorecard-trend.md` (docs)

After approval I’ll implement and ask you to click **Reload** once on the Date Range tab — cells should populate immediately.
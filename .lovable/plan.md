## Problem (verified, not theoretical)

The previous "fix" (v2.66.11.4) added `.range(0, 49999)` to RPC calls. A direct curl against the RPC as Vivek confirms this does **NOT** work:

```
HTTP/2 206
content-range: 0-999/2532
preference-applied: count=exact
```

Even with `?offset=0&limit=50000` in the URL, PostgREST returns only **1000 rows out of 2532**. This proves the platform has `db-max-rows = 1000` configured server-side, which is a **hard cap** that `.range()` cannot override. My earlier claim that the issue was fixed was wrong — the totals card still reads 1000 because the roster RPC physically returns 1000 rows.

The good news: the response includes `content-range: 0-999/2532`, so we know the true total and can page correctly.

## Fix

Replace the single `.rpc(...).range(0, 49999)` calls with **chunked pagination** in 1000-row pages until the response is shorter than the page size (or `content-range` end matches the total).

### Code changes

1. **`src/hooks/useOrganization.ts`**
   - Add a small helper `fetchAllRpcPaged<T>(fnName, params)` that loops `.rpc(fnName, params).range(from, from+999)` until exhausted. Concatenates rows.
   - Use it for both `get_reviewer_roster_slim` call sites (`useTeamMembers`-style admin path at line 264 and `useProfilesByWorkflowStage` at line 328).

2. **`src/hooks/useKpis.ts`**
   - Use the same helper for `get_reviewer_kpis_for_period` (lines ~339, ~442 — KPI grid + score-signature seed). May 2026 has 406 KPIs visible to Vivek so it's currently under the cap, but the cap will bite as KPI volume grows. Pin it now.
   - Same helper for `get_reviewer_submission_scores_for_period`.

3. **`src/components/review/EmployeeSelectorGrid.tsx`** — no changes. The roster array it consumes will simply have all 2532 entries, so `demographicFilteredMembers.length` and `periodEmployeeIds.size` become correct.

### Documentation & policy

- **DOCUMENTATION.md** — add v2.66.11.5 entry: previous `.range()` fix was insufficient because PostgREST's `db-max-rows` is a hard server-side cap; replaced with chunked pagination.
- **POLICY.md §125** — rewrite to: *Reporting RPCs that may return more than 1000 rows MUST be fetched via chunked pagination (1000-row pages) rather than a single `.range()` call. PostgREST's `db-max-rows` setting is a hard server-side cap and `.range()` cannot lift it. Use the shared `fetchAllRpcPaged` helper.*

### Regression test

- Update `src/test/bugBountyFixes.test.ts`: replace the v2.66.11.4 `.range(0, 49999)` assertions with assertions that the call sites use `fetchAllRpcPaged` (the helper name is grep-able in the source).
- Add a unit test that mocks the RPC to return 1000-row pages with `content-range` and asserts the helper concatenates correctly across two pages.

## Risk & impact

- **Data impact:** none — read-only.
- **Workflow impact:** none.
- **UI impact:** Total Employees, Total KPIs, and per-stage counters will jump from capped values to the real totals (e.g. 1000 → 2532). This is the intended correction.
- **Performance:** 3 sequential 1000-row pages instead of 1 truncated request. Each page is ~16ms server time per the curl headers. Acceptable for a once-per-period dashboard load that's already cached by React Query.
- **Regression risk:** low — helper is isolated and other RPC call sites are untouched.

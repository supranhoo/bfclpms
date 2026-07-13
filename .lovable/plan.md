## Symptom
Monthly Scorecard Report → Date Range (Trend) tab, Feb 2026 → Jul 2026 fails with
"Failed to load trend data. The range may be too wide or the server timed out."
Employees clearly have scores in every month of that range (many well below 2).

## RCA — the fetch pipeline is fragile, not the data

Verified against the DB:
- 13,203 KPIs exist across Feb–Jul 2026.
- 10,333 matching `review_submissions`; 9,912 have at least one non-null score.
So the underlying data is present in every month; the report fails during **client-side fetching**, not during aggregation.

`src/hooks/useMonthlyTrend.ts` currently:
1. Fetches all KPIs for the range (paginated).
2. For every KPI id, fetches the matching submission via `IN (...)` batches of 150.
3. With 13,203 KPIs → **~88 REST batches**, concurrency capped at 4, so ~22 waves.
4. Each batch re-runs full RLS on `review_submissions` (63 columns × 21 policies).
5. On the first batch that fails 3 attempts (URL length, connection reset, PostgREST timeout), the whole hook throws → banner shown, entire report empty.

Even when it succeeds, the second guard (line 295 in `useMonthlyTrend.ts`) throws when `subMap.size === 0`. It also throws (line 366) if RLS filters out the profiles. Any of those trip → same red banner.

Additional issue: profile fetch omits the `manager_id` guard entirely if the current user's RLS blocks a subset — silent partial hydration is possible.

## Other range-based reports in the app
Only one true "range across months" report exists — **Monthly Scorecard Report → Date Range (Trend)** (the one broken here). The rest are single-period:
- Monthly Scorecard (Single Month)
- Completion Report (per-period, one at a time)
- KPI Detail / Audit Trail / Employee Performance Summary (single period + trend chart for one selected employee only, using cached submissions)
- Team vs Manager Score (single period)

There is no other cross-month "range" report. If the user expected one, we should surface the trend inside Employee Performance Summary too — flag for future work but out of scope here.

## Fix plan

### Step 1 — Ship a single server-side RPC `get_monthly_trend`
Migration adds a stable, admin/HR-scoped SQL function:

```
get_monthly_trend(p_from_year int, p_from_month text,
                  p_to_year int,   p_to_month text,
                  p_include_inactive bool default false)
returns table (
  employee_id uuid, full_name text, employee_code text, designation text,
  department_id uuid, department_name text,
  business_unit_id uuid, business_unit_name text,
  reporting_manager_id uuid, reporting_manager_label text,
  is_active bool,
  review_year int, review_period text,
  weighted_score numeric,       -- Σ(bestScore*weight)/Σweight, per (emp,month), best-of-8 cascade
  final_score numeric            -- Σ(final_score*weight)/Σweight, per (emp,month)
)
```
- Aggregation happens in Postgres: one JOIN across `kpis` + `review_submissions` + `profiles` + `departments` + `business_units`.
- Best-score cascade identical to `bestScore()` in the hook (`final → management → auditor → hr_pms → skip_level → manager → self`).
- Skips `is_na` submissions and `weightage ≤ 0`.
- Grants: `EXECUTE TO authenticated`; the function body applies `has_role(auth.uid(),'admin')` OR `has_role(auth.uid(),'hr_pms')` OR `has_role(auth.uid(),'management')` — mirrors current report-page access. Non-privileged callers get an empty result set (function is `SECURITY DEFINER`).
- Return shape is long (one row per employee-month) — pivot happens on the client.
- Adds a supporting composite index if missing: `kpis(review_year, review_period)` and `review_submissions(kpi_id)` (already indexed).

Rollback: single `DROP FUNCTION` — additive change, no schema touch.

### Step 2 — Rewrite `useMonthlyTrend` to call the RPC
- Replace the multi-stage fetch with `supabase.rpc('get_monthly_trend', { … })`.
- Client pivots the long rows into the existing `TrendEmployee` shape (unchanged public API — table & PIP logic untouched).
- Drop the URL-length batching, the resilience retries, and the "subMap empty" guard (no longer applicable — SQL either returns rows or an error).
- Keep short `staleTime` (30 s) and the "load on click" pattern.

### Step 3 — Better error surfacing on the UI
Currently every failure collapses to one generic red banner. Change it to render the actual error message from the hook (e.g. "server timeout", "not authorized", "no matching data"). This alone would have surfaced the true cause today.

### Step 4 — Tests & docs
- SQL test (`supabase/migrations/*_test.sql` pattern already in repo) — seed 2 employees × 3 months with mixed final/manager/self scores and `is_na`, assert `get_monthly_trend` returns expected weighted averages and skips N/A.
- Hook test `src/test/monthlyTrendCacheBust.test.ts` — extend to mock the RPC and verify the pivot builds correct `monthlyScores`.
- Component test — asserts the error banner shows the real message, not the generic string.
- `DOCUMENTATION.md`: version bump, describe RPC + client rewrite.
- `POLICY.md`: add note that multi-period trend reports MUST aggregate on the server (client-side batching over N×100 REST calls is banned) — reinforces `mem://architecture/database/large-export-pagination-policy`.

## Risk & Impact
- Data: read-only, no schema change to existing tables; only a new function.
- Workflow: none. Same numbers, same PIP logic, same threshold.
- UI: only the error banner text changes (better) and the report actually loads.
- Regression risk: low. RPC is additive; client can fall back to the old code path behind a feature flag if needed (I'll gate the new hook behind `USE_TREND_RPC=true`, default on; toggling off restores prior behavior).
- Scalability: single SQL round trip regardless of range width (still capped at 12 months by hook).

## Non-scope
- I will NOT change PIP threshold logic, the export sheet layout, or the Single-Month tab.
- If the user wants an additional cross-month "range" report elsewhere (Employee Performance Summary, KPI matrix), that is a separate ticket — I'll note it in DOCUMENTATION.md as a follow-up.
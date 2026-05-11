## Problem

On HR PMS Review (Vivek 101784, March 2026), all stat tiles read **0** even though "978 eligible of 1,000 active employees" is shown. The Pending / In Review / Reviewed counters are blank because a critical underlying query is timing out (HTTP 500, code `57014`).

## Root Cause (confirmed from network capture)

`useProfilesByWorkflowStage` (in `src/hooks/useOrganization.ts`, lines ~429–437) issues this query as the "score-signature seed" that powers HR PMS Reviewed / In Review / Pending counts:

```text
GET /rest/v1/kpis?select=id,employee_id&review_period=eq.March&review_year=eq.2026&offset=0&limit=1000
→ 500 { code: "57014", message: "canceling statement due to statement timeout" }
```

This is the **same RLS-on-full-period scan** we just fixed for `useKpisByPeriodRanges`. We routed the wide grid fetch through `get_reviewer_kpis_for_period` yesterday, but missed this second call site, so the HR PMS stat cards still pay the 8 s timeout penalty and silently fall back to empty Sets → counts collapse to 0.

The other narrower seed query (`select=employee_id&status=eq.hr_pms_review&...`) returns 200 quickly because the status predicate keeps the row count tiny — that's why the roster lists 978 eligible employees but the counters are zero.

## Fix

Replace the timing-out `fetchAllPaged` block at `src/hooks/useOrganization.ts:429-437` with a single call to the existing `get_reviewer_kpis_for_period(p_period, p_year)` RPC, then project the returned rows down to `{ id, employee_id }`. No new migration is required — the RPC already exists, returns the same data, runs as `SECURITY DEFINER` with `statement_timeout = 30 s`, and is already authorized for `authenticated`.

```ts
const { data: periodKpis, error: rpcErr } = await (supabase as any).rpc(
  'get_reviewer_kpis_for_period',
  { p_period: reviewPeriod, p_year: reviewYear }
);
if (rpcErr) throw rpcErr;
const kpiToEmp = new Map<string, string>();
for (const k of (periodKpis || []) as Array<{ id: string; employee_id: string }>) {
  kpiToEmp.set(k.id, k.employee_id);
}
```

Everything downstream (the `review_submissions` batched lookup keyed by KPI ids) stays unchanged.

## Risk & Impact

- **Data Impact:** None. RPC returns the exact same row set as the failed PostgREST call.
- **Workflow Impact:** None — read-only path used to compute reviewer-stat tiles.
- **UI/UX:** HR PMS / Audit / Management dashboards regain accurate Pending / In Review / Reviewed counts under load.
- **Regression Risk:** Very low. Same RPC already powers the grid fetch (`useKpisByPeriodRanges`) used directly above this code path.
- **Mitigation:** After applying, re-test as Vivek on `/dashboard?view=hr_pms` (March 2026) and confirm the four stat tiles populate and no `57014` errors appear in network logs.

## Files Touched

- `src/hooks/useOrganization.ts` — single block edit inside `useProfilesByWorkflowStage`.

## Out of Scope

- No DB migration.
- No UI / styling changes.
- No changes to RLS, auth, or other dashboards beyond the score-signature seed they share via this hook.

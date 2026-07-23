
## What you're seeing

On the annual review detail page, the two circled blocks — **OVERALL / 100** and **Projected final score to date** — already render for Dept Head and BU Head (`TeamReviewDetailContent.tsx` lines 446–450). They just come out as `0.00 / 100` for these reviewers while an Admin viewing the *same employee* sees `87.20 / 100` (your second screenshot, Sunkara Satyanarayana).

## Root cause (verified)

The "Overall" number is driven by the Carry KRA snapshot inside `useResolvedSystemScores` → `buildCarrySnapshot` → a direct `SELECT` on `public.kpis` + `public.review_submissions`.

That `SELECT` is filtered by the RLS policy `Consolidated KPI view access` on `public.kpis`, which delegates to `can_view_kpi_row(...)`. That helper only lets a reviewer see a subordinate's KPI rows when they are on the KPI's direct reporting/audit chain. A Dept Head or BU Head who is annual-review reviewer for an employee — but is NOT that employee's monthly-KPI reporting manager — gets **zero rows**, so `aggregateMonthly` produces all-null months, `rating = 0`, `value = 0`, and both cards collapse to 0.

Admin bypasses this via the `Admins can manage all KPIs` policy, which is why you see the correct 87.20.

This is a visibility / data-scoping gap, not a math bug. `computeScoreComposition`, `computeRunningFinalScore`, `RunningFinalScoreCard`, and the render gate are all correct.

## Fix plan

Add a scoped, read-only server function that returns the same Carry KRA rows an admin would see, but ONLY when the caller has legitimate reviewer/assistance access to that employee's annual review instance. Then have the frontend call it instead of hitting `kpis` directly on reviewer surfaces.

### 1. New Postgres function (SECURITY DEFINER, read-only)

`public.get_annual_review_carry_kra_rows(p_instance_id uuid, p_fy_start int)`
- Loads the instance and verifies the caller is one of: `admin`, `hr_pms`, `management`, the employee themselves, or a named reviewer on the instance (`manager_id`, `skip_id`, `dept_head_id`, `bu_head_id`, `hr_id`, `management_id`), OR that `can_access_annual_review_instance_for_assistance(p_instance_id)` returns true.
- If not authorised → raise, so the client falls back gracefully.
- If authorised → returns rows shaped exactly like today's client-side query:
  `(kpi_id, review_period, review_year, weightage, is_na, final_score, manager_score, auditor_score, self_score)` for `employee_id = instance.employee_id` and `review_year IN (fy, fy+1)`.
- `GRANT EXECUTE ... TO authenticated, service_role`. `SET search_path = public`. No writes.

Rationale: authorisation is derived from the annual-review instance's reviewer chain — the same chain that gates every other reviewer surface — so exposing these rows to that exact audience is consistent with existing policy and does NOT widen visibility beyond it. Non-reviewers still see nothing.

### 2. Wire the RPC into the read path

`src/services/annualReview/carryKraScore.ts`
- Add `fetchMonthlyKraScoresForInstance(instanceId, employeeId, fyStart, excludeNa)` that:
  1. Calls the new RPC.
  2. On success → maps rows into the existing `RawRow` shape and calls the unchanged `aggregateMonthly`.
  3. On `permission denied` / RPC 404 → falls back to the current direct-table path (keeps admin surfaces and other callers unchanged).
- Keep `fetchMonthlyKraScores` and `buildCarrySnapshot` intact for admin/employee paths.
- Add `buildCarrySnapshotForInstance(...)` that uses the RPC-backed fetcher.

### 3. Frontend hook

`src/hooks/useResolvedSystemScores.ts`
- Add an optional `instanceId?: string` parameter.
- When present, the carry-KRA `queryFn` calls `buildCarrySnapshotForInstance` instead of `buildCarrySnapshot`.
- Keep the query key extended with `instanceId` so the cache is scoped (avoids cross-user leakage of the same TanStack cache entry).

### 4. Call-site update

`src/components/annual-review/TeamReviewDetailContent.tsx` (line 249) — pass `instance.id` into the hook. This is the ONLY surface where the fix is required, because employee self-review already resolves under their own auth (they can always see their own KPIs), and Admin/HR see everything via the existing policy.

Nothing else changes — the render gate at line 448 (`role === 'dept_head' || role === 'bu_head'`) already surfaces the Projected card; the Overall card at line 446 is always rendered.

## Risk & impact

| Area | Impact |
|---|---|
| Data visibility | Widens Carry-KRA READ ONLY to Dept/BU/HR/Management/Skip named on the annual review instance — the same people who already see the review's criteria, comments, and final score. No net-new information class. |
| Write paths | None. The RPC is `STABLE`/read-only; RLS on `kpis` / `review_submissions` for INSERT/UPDATE/DELETE is untouched. |
| Admin & employee views | Unchanged (they hit the current path). |
| Performance | One RPC per open review; server-side query is the same shape as today's client query. |
| Rollback | Drop the new RPC + revert 2 TS files. Additive migration. |

## Verification (post-build)

1. As BU/Dept Head named on Sunkara's instance, reopen the same detail page → OVERALL should now show `87.20 / 100` and Projected should show a non-zero value with the correct "based on N of 7 stages" caption.
2. As a random unrelated user (not a reviewer for that instance), open the URL directly → RPC returns `permission denied`, the card falls back to `0.00 / 100` with no data leak.
3. Admin view unchanged.
4. Unit test: `buildCarrySnapshotForInstance` maps RPC rows through `aggregateMonthly` identically to `buildCarrySnapshot` given the same input rows.

## Files touched

- **New migration** — `get_annual_review_carry_kra_rows` RPC + grants.
- `src/services/annualReview/carryKraScore.ts` — add instance-scoped fetcher + snapshot builder.
- `src/hooks/useResolvedSystemScores.ts` — accept `instanceId`, route through the RPC when present.
- `src/components/annual-review/TeamReviewDetailContent.tsx` — pass `instance.id` into the hook.
- `src/modules/annual-review/POLICY.md` — add "AR-CARRY-KRA-REVIEWER-VISIBILITY (ADR-139)" note.
- New unit test alongside `carryKraScore` for the mapper.

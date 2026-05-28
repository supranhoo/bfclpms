## Fix — KPI Weightage Dashboard "0 Employees" (and other admin views timing out)

### Root cause (confirmed, not guessed)
- Logged in as Jaspal (101125 / admin) and reproduced the exact symptom.
- Browser console shows `GET /rest/v1/kpis?review_year=eq.2026&employee_id=in.(...25 ids)` and `POST /rpc/rpc_weightage_variance_summary` returning **HTTP 500**.
- Postgres logs at the same timestamp: `ERROR: canceling statement due to statement timeout`.
- `EXPLAIN ANALYZE` of the same kpis query bypassing RLS runs in **1.3 ms** using `idx_kpis_employee_id`.
- Therefore the bottleneck is **RLS evaluation on `public.kpis`**, not the query, not the data, not the May-04 fix.

`public.kpis` has 9 PERMISSIVE `SELECT` policies. Each calls `auth.uid()` and/or `has_role(auth.uid(), …)` or an `EXISTS` subquery per row. Postgres re-evaluates these per row instead of once per query, because `auth.uid()` and `has_role(…)` are marked `STABLE` but the planner won't promote them to initplans unless they're wrapped in a scalar sub-select. With ~2,000 rows × 7 per-row function calls, the query crosses the 8 s gateway cutoff. PostgREST surfaces this as HTTP 500.

Same problem hits the `rpc_weightage_variance_summary` RPC, which internally scans `kpis`.

### Scope of impact
- KPI Weightage Dashboard (matrix + summary) — broken now.
- Any admin/auditor/management view that fans out a `kpis` query across more than ~20 employees at once — at risk (KPI Mapping Matrix, Pending Reviews, KPI Employee Matrix Report, Bulk Zero-Scoring sweep, etc.). The same RLS evaluation pattern applies on every read.
- Read-only impact on regular employees / managers (their policies match a single row pattern, no fan-out).

### Risk & impact

| Area | Impact |
|---|---|
| Data | None. No row, schema, or column change. |
| Workflow | None. Same access rules — just evaluated more efficiently. |
| Security | Neutral. The new policy bodies are logically identical; only the evaluation form changes. |
| UI/UX | Dashboard returns to listing 149 employees in <2 s. |
| Regression risk | Low. Pattern is the documented Supabase recommendation. We will keep the existing logic verbatim, only changing `auth.uid()` → `(select auth.uid())` and `has_role(auth.uid(), x)` → `(select has_role(auth.uid(), x))`. |
| Rollback | Single migration; can be reverted by restoring the prior policy bodies. |

### Plan

#### Step 1 — Migration: rewrite `public.kpis` SELECT policies for initplan promotion
For each of the 9 SELECT policies, recreate with the auth calls wrapped in scalar sub-selects:
- `auth.uid()` → `(select auth.uid())`
- `has_role(auth.uid(), 'admin')` → `(select public.has_role((select auth.uid()), 'admin'))`
- `has_report_access_override(auth.uid())` → `(select public.has_report_access_override((select auth.uid())))`
- `get_skip_level_manager(p.id) = auth.uid()` → `get_skip_level_manager(p.id) = (select auth.uid())`

Apply identically to UPDATE / DELETE / INSERT policies on `kpis` if they exhibit the same per-row call pattern (will audit in the same migration).

#### Step 2 — Verify with EXPLAIN inside the same migration
Run `EXPLAIN (ANALYZE, BUFFERS)` as part of a `DO` block on a representative query and `RAISE NOTICE` the plan summary. Acceptance: planning time < 5 ms and per-row InitPlan instead of SubPlan.

#### Step 3 — Sanity-pass the same pattern on tables we know are admin-fan-outed
Audit + rewrite (if affected) SELECT policies on: `kpi_scores`, `org_kpi_data_owners`, `kpi_audit_logs`, `kpi_observations`. **Only** if their policies call `auth.uid()` / `has_role()` un-wrapped. No change to logic — purely the wrapping idiom.

#### Step 4 — Defensive UI: surface errors instead of silent empty state
`src/pages/admin/KpiWeightageDashboard.tsx` — destructure `isError` / `error` from both hooks and render a red error card with a Retry button, so any future RLS / timeout failure is visible immediately instead of looking like a data regression.

`src/hooks/useKpiWeightageMatrix.ts` — re-throw the original PostgREST error inside both `queryFn`s (today the catch path swallows them, returning empty data).

#### Step 5 — Tests + SSOT
- `src/test/kpiWeightageDashboardErrorState.test.tsx` — RPC throws → red error card + Retry button visible.
- `supabase/tests/kpis_rls_perf.sql` (or a vitest using a SQL fixture) — assert plan for an admin query uses InitPlan, not per-row SubPlan.
- `DOCUMENTATION.md` — add an entry to the "Performance" section noting the RLS-wrapping convention.
- `POLICY.md` §RLS — new rule: "All `public.kpis` and admin-scoped read policies MUST wrap `auth.uid()` and `has_role(…)` in scalar sub-selects to enable initplan promotion."
- `mem/architecture/security/rls-recursion-management` — append the wrapping convention.

### Out of scope (won't touch in this fix)
- Restructuring the data-owners policy to drop the `normalize_kpi_text()` calls. (Already gated by `is_org_level = true`, short-circuits for employee KPIs.)
- The `rpc_weightage_variance_summary` body itself — once RLS planning is fixed, it executes against `kpis` at the same speed as bulk admin queries elsewhere.
- Other duplicate-account hygiene (separate item).

### Verification after deploy
1. Reload the dashboard logged in as Jaspal → expect "149 Employees" badge and KPI rows.
2. Watch `postgres_logs` for 5 minutes after deploy → expect zero `statement timeout` entries on `kpis`.
3. Re-run the EXPLAIN from Step 2 against production via `read_query`.

### What I need from you
Just approval. The migration is additive (DROP POLICY + CREATE POLICY with identical logic, only wrapping changed), no downtime, no data movement. I'll roll it out, verify with the three checks above, and report back.

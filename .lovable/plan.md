## Audit Panel — Server-Side Pagination + Query Batching

### Problem (measured)
Cold load of `/dashboard?view=audit` pulls the *entire* organization's data even though the grid only renders 24 cards:
1. `useKpisByPeriodRanges` — paginated RPC, ~14k KPIs in 1k chunks → ~14 round-trips
2. `useReviewSubmissionScoresByKpiIds` — paged batch of 500 KPI ids → 5–30 round-trips
3. `useBulkEmployeeWorkflows` — one entry per employee id
4. `useAllProfiles` / `useStageFilteredProfiles` — full org roster

Per-employee badges (`getEmployeeKpiStats`) are then computed in JS against the full set. This is the root cause of the slow first paint that the auditor reported. Local pagination already exists (page/size in URL) but the *fetch* is org-wide.

### Goal
Fetch and compute **only the visible page** (default 24 rows) on the server, in one batched RPC. Keep filters, sort, search, and badge semantics identical.

---

### Plan

**Step 1 — DB: paged roster RPC with embedded stats** *(verify)*
Add `public.get_reviewer_dashboard_page(...)` (SECURITY DEFINER, search_path=public):

Inputs:
- `p_view_level text` (`audit` | `management` | `hr_pms` | `skip_level` | `team` | pending_*)
- `p_viewer_id uuid` (defaults to `auth.uid()`)
- `p_period text`, `p_year int`, `p_period_ranges jsonb` (YTD/QTD support)
- Filters: `p_search`, `p_department_id`, `p_designation_id`, `p_grade_id`, `p_manager_id`, `p_auditor_id`, `p_emp_status` (`active`/`inactive`/`all`), `p_status_filter` (`pending`/`reviewed`/`cross_check`)
- `p_sort text`, `p_offset int`, `p_limit int`

Returns one row per visible employee + `total_count` window:
- profile slice (id, full_name, email, designation, department, grade, manager_id, is_active, avatar_url, relationship)
- precomputed badges: `pending_count`, `reviewed_count`, `cleared_kra_set`, `total_kpis`
- `workflow_stages text[]` (resolved template — replaces `useBulkEmployeeWorkflows` for the page)
- `overall_weighted_score numeric` (replaces `useEmployeeScoresForPeriod` for the page)

Internally it composes existing primitives (`get_reviewer_kpis_for_period`, workflow resolver, score signature) but scoped to the paged employee id list — never the whole org.

Grants: `GRANT EXECUTE ON FUNCTION ... TO authenticated;` + service_role.

*Verify*: explain plan; cold call <300 ms for page 1; index on `(employee_id, review_period, review_year)` on `kpis` already exists.

**Step 2 — New hook `useReviewerDashboardPage`** *(verify)*
File: `src/hooks/useReviewerDashboardPage.ts`. Wraps the RPC with TanStack Query:
- queryKey includes viewLevel, period, ranges, filters, sort, page, size, viewer id
- `staleTime: 60_000`, `gcTime: 5*60_000`, `keepPreviousData: true`
- Returns `{ rows, totalCount, isLoading, isError, refetch }`

**Step 3 — Refactor `EmployeeSelectorGrid` consumer** *(verify, surgical)*
- Add a feature flag `VITE_AUDIT_PANEL_PAGED_RPC` (default ON) so we can roll back without a deploy.
- When flag is on **and** `viewLevel ∈ {audit, management, hr_pms, skip_level} && !exploreMode`:
  - Replace the three heavy hooks with `useReviewerDashboardPage`
  - Map response rows into the existing `EmployeeProfile + stats` shape so the render path is unchanged
  - Pagination controls drive `p_offset/p_limit` instead of slicing client array
  - Search / filters become server params (debounced 300ms — already debounced in UI)
- When flag is off OR view is `team`/explorer mode (which needs full client filter semantics today): leave the existing path untouched.

UI changes: **none visible**. Same cards, badges, filters, pagination controls, status pills. Total count badge already exists; it now reflects server total.

**Step 4 — Tests + mock data** *(verify)*
- `src/test/auditPanel/pagedRpcContract.test.ts` — asserts the hook posts the expected RPC name and parameters and maps `total_count` correctly.
- `src/test/auditPanel/badgeParity.test.ts` — fixture with 3 employees × 5 KPIs across stages; asserts server-computed badge numbers equal the legacy client computation (parity guard).
- Mock data updated in `src/test/mocks/reviewerDashboard.ts` to mirror RPC shape.
- Existing `perfHotspotIndexes.test.ts` extended to require the new RPC's supporting index list.

**Step 5 — Docs + Policy** *(SSOT)*
- `DOCUMENTATION.md` §2.66.57 — RPC contract, hook usage, flag, rollback.
- `POLICY.md` §PERF-AUDIT-PANEL-PAGINATION — "Reviewer dashboards MUST page roster + stats server-side; no client-side org-wide KPI scan for visible-card computation."

---

### Technical details

```text
Before (cold load, viewer = auditor):
  client ──► get_reviewer_kpis_for_period (×14 pages)         ~14k rows
         ──► review_submissions in(...)    (×30 batches)      ~14k rows
         ──► get_resolved_workflow_template ×N employees
         JS:  compute badges for ALL employees
         render: slice to 24

After:
  client ──► get_reviewer_dashboard_page(page=1, size=24, ...) 1 call, 24 rows
         render: 24 cards
  (other pages fetched on demand, cached 60s)
```

Round-trip count: ~45+ → **1** per page. Payload: ~14 MB → ~10 KB.

### Risk & Impact Report

| Area | Impact | Mitigation |
|---|---|---|
| Data | Read-only RPC; no writes | RLS preserved via SECURITY DEFINER + viewer-scoped checks |
| Workflow | None | Badge math ported 1:1 from `getEmployeeKpiStats`; parity test |
| UI | None visible | Same components; flag-gated |
| Regression | Search/filter semantics could drift | Feature flag + parity test + soak before flipping default for `team` |
| Scalability | Linear in page size, not org size | Indexes verified; `LIMIT` enforced server-side |
| Rollback | Flip `VITE_AUDIT_PANEL_PAGED_RPC=false` | Old hooks remain in tree until v2.66.60 |

### Expected outcome
- First paint of `/dashboard?view=audit`: target **<1.0 s** (from current ~5–8 s on a 14k-KPI org).
- DB total time for `get_reviewer_kpis_for_period` drops ~95% on next `pg_stat_statements` snapshot.
- No UI changes; same filters, same badges, same pagination controls.

### Out of scope
- `team` view manager roster (already paged via dedicated RPC) — left untouched.
- Explorer mode (cross_check) — keeps client-side path because it needs org-wide cross-cutting filters.
- Realtime updates, bundle splitting, or new indexes beyond what the RPC's plan reveals.

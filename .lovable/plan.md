## Problem

`/reports/annual-review` → **Comprehensive** tab silently truncates at **1,000 rows**. `fetchComprehensiveReport()` (`src/services/annualReview/comprehensiveReport.ts:50`) calls the RPC with a bare `.rpc(...)` and no `.range()` loop. PostgREST caps any RPC response at `db-max-rows = 1000` (same class of bug as ADR-094 for edge functions and POLICY §125 for reporting RPCs — the paged helper `fetchAllRpcPaged` in `src/lib/fetchAll.ts` already exists for exactly this).

For a roster of ~2,533 active employees the report shows only the first 1,000; KPIs, department %, rating chart, highlights, and Excel export are all understated.

## Risk & Impact

- **Data:** Read-only. No schema, no RLS, no writes.
- **Workflow:** None — pure fetch layer change.
- **UI:** Comprehensive tab counts/tables/chart become complete; no visual redesign.
- **Regression risk:** Low. Same pattern already shipped for `get_reviewer_roster_slim` (POLICY §125). One helper swap.
- **Perf:** 3 round-trips instead of 1 for a full cycle (~2.5k rows). Well within budget; existing tab already renders the full set in memory.
- **Rollback:** Revert the single service file.

## Fix

1. **`src/services/annualReview/comprehensiveReport.ts` — `fetchComprehensiveReport`**
   Replace the single `.rpc()` call with `fetchAllRpcPaged<ComprehensiveRow>((from, to) => supabase.rpc('get_annual_review_comprehensive_report', { p_cycle_id: cycleId }).range(from, to))`. No RPC signature change — PostgREST honours `Range` on `SETOF` RPCs.

2. **Regression test — `src/test/annualReview/comprehensiveReportPaging.test.ts`** (new)
   - Asserts `fetchComprehensiveReport` uses `fetchAllRpcPaged` (source scan, matching the style of `seedInstances.paging.test.ts` and `bulkWorkbookFullFetch.test.ts`).
   - Asserts the built RPC query chain includes `.range(` (guards against future removal).
   - Simulates a 2,533-row roster via a mocked pager and confirms all rows are returned, including row #1,500 and #2,532 — the exact assertion pattern already used for the seeder fix.

3. **Docs / policy sync**
   - `POLICY.md` — add `§125b Annual Review Comprehensive Report` under the existing reporting-RPC pagination rule.
   - `DOCUMENTATION.md` — Version History entry `v2.66.116 — Comprehensive AR report paginates RPC (removes 1,000-row cap)`.
   - `docs/adr/ADR-115.md` — one-page RCA linking ADR-094 (edge-fn pagination) and POLICY §125 (reporting RPC pagination).

## Out of scope (deliberately)

- Server-side pagination of the tab UI. The tab is a single-cycle export/analytics view; converting it to pageable would change the product. If you want that too, say so and I'll plan it separately.
- Other AR RPCs. `get_annual_review_dept_submission_summary`, `_reviewer_pending_queues`, `_pending_at_stage` are aggregated (dept/reviewer count rows, well under 1k) — I'll add a follow-up audit ticket only if you want defensive pagination on them.

## Verification

- New test passes; `bun run build` clean.
- Manual: open Comprehensive tab on the active cycle, confirm KPI card **Total** matches `SELECT count(*) FROM annual_review_instances WHERE cycle_id = <active>` (≈2,533, not 1,000), and Excel export row count matches.

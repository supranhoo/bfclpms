# Verification — Performance Console → Dashboard connectivity & propagation

Date: 2026-08-16 · Period tested: **August 2026** · Signed in as an `admin`
(read + write tier). Script: `scripts/consoleDashboardParity.ts`.
Contract tests: `src/test/consoleDashboardParity.test.ts` (12 tests, green).

## What was tested

1. **Front → back connectivity** — a real browser-equivalent Supabase session
   calling the console RPCs over the Data API.
2. **Authorization tiers** — `bu_console_can_read` / `bu_console_can_write`.
3. **Propagation** — a value written through a console write RPC
   (`bu_console_row_override`) is read back on the dashboard's own read path
   (`kpis` select), for one numeric, one binary and one tiered KPI.
4. **Scoring-model parity** — `resolveKpiScoringModel` yields an identical model
   from the console payload and from the dashboard row, per type.

## Live run result — ALL CHECKS PASSED

| Check | numeric | binary | tiered |
| --- | --- | --- | --- |
| console detail read (`bu_console_kpi_detail`) | PASS | PASS (41-row group) | PASS |
| scoring model parity | PASS | PASS | PASS |
| console write accepted (`updated: 1`) | PASS | PASS | PASS |
| dashboard reads the console value | PASS | PASS | PASS |
| original value restored (null stays null) | PASS | PASS | PASS |

Plus: auth PASS, `bu_console_can_read` PASS, `bu_console_can_write` PASS,
`bu_console_tree` PASS (55 categories).

## Findings from the first run (fixed)

1. `bu_console_tree` and `bu_console_kpi_detail` return a **jsonb object**
   (`{authorized, categories}` / `{authorized, rows, total, group}`), not an
   array. A caller treating them as arrays silently sees "no data".
2. `bu_console_row_override` correctly **refuses** rows past `kra_set`
   (`{"reason":"past_kra_set","updated":0}`) — the console cannot retune scope
   once a review has moved on. The smoke script now selects `kra_set` rows.
3. `Number(null) === 0` in a naive restore turns a `NULL` target into `0`. The
   script now restores the byte-identical original; the two rows affected by the
   first run were repaired through the same audited RPC.

## Re-running

```bash
bun scripts/consoleDashboardParity.ts August 2026
bun scripts/consoleDashboardParity.ts --restore <kpiId> <value|null>   # manual undo
```

Every write is audited in `bu_console_edit_runs` / `bu_console_edit_items`, so a
run is fully traceable and reversible. Rows with `final_score IS NOT NULL` are
excluded (POLICY §88).

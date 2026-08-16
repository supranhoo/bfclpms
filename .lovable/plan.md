# Console → Dashboard connectivity & propagation test

Goal: prove, with evidence, that (1) the frontend can reach the backend, and
(2) a change made in the Performance Console is the same change an employee/
reviewer sees on their dashboard scorecard — for all three KPI types
(value-based, binary Yes/No, tiered).

## Assumptions
- Test runs against the live project database using an admin session.
- No permanent data change: every write is reverted in the same run.
- "Impact on the user's dashboard" means the scorecard read path
  (`kpis` row + `review_submissions` + resolved scoring model), not a UI redesign.

## Risk & impact
- Data: writes touch real KPI rows. Mitigation: pick one KPI row per type that
  has `final_score IS NULL` (POLICY §88 rows are never selectable anyway),
  snapshot the before-values, restore after assertion, and abort the run if
  restore fails.
- Workflow: no stage advancement is performed in the live smoke test; only
  definition/scope fields (target, weightage) and, for the read side, score
  resolution. Advancement parity stays covered by existing unit tests.
- Regression risk: none — additive test files only.
- Rollback: delete the added test files.

## What gets built

### 1. Live connectivity + propagation smoke script
`scripts/consoleDashboardParity.ts` (run on demand, not in CI):
- Auth check: sign in with a minted session, confirm `auth.uid()` resolves and
  `bu_console_can_read` / `bu_console_can_write` return the expected tiers.
- Pick three KPI rows for the current period, one per `uom_type`
  (`numeric`, `binary`, `tiered`), each unlocked.
- For each row:
  1. Read via console path: `bu_console_tree` → `bu_console_kpi_detail`.
  2. Read via dashboard path: the same KPI as the scorecard hook loads it.
  3. Assert the scoring model resolved by `resolveKpiScoringModel` is identical
     on both sides (type, options high→low, thresholds).
  4. Write through the console RPC (`bu_console_row_override` for target /
     weightage; `bu_console_group_edit_definition` for a group-level field).
  5. Re-read the dashboard path and assert the new value is visible there.
  6. Restore the original values and re-assert.
- Prints a table: KPI, type, console value, dashboard value, match yes/no.

### 2. Contract tests (permanent, run in CI)
`src/test/consoleDashboardParity.test.ts`:
- Console detail payload and dashboard KPI row feed the same
  `resolveKpiScoringModel` and produce the same model for numeric / binary /
  tiered fixtures, including inverted safety binaries (No = 5).
- A binary/tiered KPI never yields numeric threshold bands, and an
  unconfigured KPI yields `unconfigured` on both surfaces (ADR-271).
- `scoringModelLockReason` blocks per-employee model forks on both paths
  (ADR-282), so the console cannot create a KPI the dashboard can't score.
- Group-owned field edits are reflected in the fields the dashboard reads
  (`uom_type`, `qualitative_options`, `r0..r5`) — asserted against the field
  lists in `rowOverrideModel.ts`, so a future field rename breaks the test.

### 3. Report
`docs/verification/console-dashboard-parity.md` — the run output, the three
KPI ids used, and pass/fail per type.

## UI changes
None.

## Docs
- `DOCUMENTATION.md`: add the verification procedure and how to re-run it.
- `POLICY.md`: record §CONSOLE-DASHBOARD-PARITY — any new console write RPC
  must be covered by this parity check before release.

## Technical notes
- Read paths compared: `bu_console_kpi_detail` (console) vs the scorecard's
  `kpis` + `review_submissions` fetch (dashboard). Score resolution uses the
  8-stage fallback chain, unchanged.
- The smoke script uses the Supabase JS client with a minted session, never a
  service key.
- No RLS, grant, or schema change is part of this work.

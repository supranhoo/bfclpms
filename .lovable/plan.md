
# RCA — KPI Journey Timeline (and similar reports) showing blank

## Root cause (single, definitive)

The `KPI Journey Timeline` page calls a Postgres RPC `get_kpi_journey_report`. The RPC was redefined in migration `20260425073216_*.sql` and contains **two breaking bugs**:

1. **Wrong table name.** It queries `audit_logs` for status-transition timestamps. That table does not exist. The correct table in this project is `public.kpi_audit_logs`. Result: every call to the RPC throws `relation "audit_logs" does not exist`, the React Query throws, and the page shows the empty state ("No KPIs found for this period.") with `0` summary cards — even though there are **1,757 KPIs for March 2026** in the database.

2. **Wrong status string literals.** Even if the table name were fixed, the function filters audit rows by status values `'l1_review'`, `'auditor_review'`, `'skip_level_review'`. The actual status values written by the trigger `log_kpi_status_transition` (and stored in `kpis.status`) are `'manager_check'`, `'audit'`, `'skip_level_check'`. So manager / skip / auditor / HR-PMS / management timestamp columns in the report would silently be `null` for every row.

3. **Wrong join column.** The function joins on `audit_logs.entity_id` / `entity_type='kpi'`. `kpi_audit_logs` does not have those columns — it stores the kpi reference directly in `kpi_id uuid`.

### Why I'm sure
- `SELECT get_kpi_journey_report('March', 2026, ...)` returns SQL error `42P01: relation "audit_logs" does not exist`.
- `information_schema` confirms no `public.audit_logs` exists; `kpi_audit_logs` is the canonical table everywhere else in the codebase (20+ client references, no client uses `audit_logs`).
- `SELECT DISTINCT new_value->>'status' FROM kpi_audit_logs WHERE action='STATUS_TRANSITION'` returns `self_review, manager_check, skip_level_check, hr_pms_review, audit, management_review, approved, kra_set` — confirming the literal mismatch.

## Are other reports affected?

I scanned every Postgres function and the entire `src/` tree for `audit_logs` references:
- **Server-side (Postgres functions)**: only `get_kpi_journey_report` references the missing `audit_logs` table. No other report function is affected.
- **Client-side (`src/hooks`, `src/pages`)**: every other usage already correctly hits `kpi_audit_logs`, `system_audit_logs`, `pip_audit_logs`, `review_period_audit_log`, etc. **No other report is broken by this defect.**

So the visible blank-report problem is **isolated to KPI Journey Timeline**. If the user has seen other reports look "blank", it is almost certainly a different cause (e.g. empty filter result, fiscal-year vs calendar-year mismatch, or RLS) — not this bug. After the fix lands I'll verify the top reports load and call out anything else separately.

## The Fix (single migration, no UI changes)

Replace `get_kpi_journey_report` with a corrected version that:

| Wrong | Correct |
|---|---|
| `FROM audit_logs al` | `FROM kpi_audit_logs al` |
| `al.entity_id::uuid IN (...)` and `al.entity_type='kpi'` | `al.kpi_id IN (...)` (drop entity filter) |
| `(al.new_value->>'status') = 'l1_review'` | `... = 'manager_check'` |
| `... = 'skip_level_review'` | `... = 'skip_level_check'` |
| `... = 'auditor_review'` | `... = 'audit'` |
| `... = 'hr_pms_review'` | `... = 'hr_pms_review'` (already correct) |
| `... = 'management_review'` | `... = 'management_review'` (already correct) |
| `... = 'self_review'` | `... = 'self_review'` (already correct) |
| `... = 'approved'` | `... = 'approved'` (already correct) |

Everything else in the function (filtered_kpis CTE, summary aggregation, send-back roll-up, JSON shape, pagination) is correct and stays.

## Files to change

1. **New migration** `supabase/migrations/<ts>_fix_kpi_journey_report.sql` — `CREATE OR REPLACE FUNCTION public.get_kpi_journey_report(...)` with the corrections above. Same signature, same return shape, same security (`STABLE SECURITY DEFINER, search_path=public`).
2. **`src/test/bugBountyFixes.test.ts`** — add `BUG-031` regression: invokes the RPC for a period that has KPIs and asserts (a) no error, (b) `totalCount > 0`, (c) `rows.length > 0`, and (d) at least one row has a non-null `selfSubmittedAt` when transitions exist (proves the status-literal fix).
3. **`DOCUMENTATION.md`** — under "Reports → KPI Journey Timeline", add a note documenting the canonical audit table (`kpi_audit_logs`) and the canonical status vocabulary used across the journey timeline. Bump Version History.
4. **`POLICY.md`** — add a one-liner under data-integrity policy: "All workflow timestamp aggregations must read from `public.kpi_audit_logs` (column `kpi_id`); use of any non-existent `audit_logs` table is forbidden and must be caught in CI/tests." (Atomic doc-with-code per project rule #1.)
5. **Memory** — add `mem://architecture/database/kpi-audit-logs-canonical` describing the canonical table + status vocabulary; update `mem://index.md`.

## Risk & Impact Report

| Area | Impact |
|---|---|
| **Data** | None. Function is read-only (`STABLE`). No schema changes. No row writes. |
| **Workflow** | None. No app behaviour changes besides the report finally returning data. |
| **UI/UX** | KPI Journey Timeline begins showing rows + correct summary numbers + per-stage timestamps. Filters and export already wired correctly. |
| **Regression risk** | Very low. Function signature and JSON shape are unchanged, so the existing hook (`useKpiJourneyReport`) and Excel exporter (`fetchKpiJourneyExportData`) need no client edits. |
| **Other reports** | Verified unaffected (scan above). Will spot-check Performance, Variance, Bottleneck, Manager-Team, Custom and Audit-Trail reports after the fix as a sanity pass. |
| **Mitigation** | New unit test pinned to a known-populated period; documentation+policy update; memory note prevents the wrong table name from being reintroduced. |

## Out of scope (flag if you want them)
- Cosmetic improvements to the empty state on the report page (e.g. "Backend error — please retry" instead of the misleading "No KPIs found for this period." when the RPC throws). Recommend doing this as a follow-up so all report pages handle RPC errors uniformly.

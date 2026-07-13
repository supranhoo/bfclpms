
## Goal
Give admins a single screen that answers: **"When was KRA first rolled out for this employee, by whom, and how?"** — especially useful for new joiners.

## What the user will see
A new admin page **Admin → Reports → First KRA Rollout** with:

- Search box (name / employee code) + filters: Company, Business Unit, Department, Date-range (rolled-out on), Source.
- Paginated table (server-side, 50/page) with columns:
  - Employee (name + code)
  - Designation / Department
  - Date of Joining
  - **First KRA period** (e.g. "July 2026")
  - **Rolled out on** (timestamp)
  - **Rolled out by** (user name; "System / Cron" when automated)
  - **Source** — one of: `Bundle`, `Smart Assign`, `Manual`, `Rollover`, `Import`
  - KPIs created (count)
  - Row action: "View KRAs" → deep-link to the employee's KRA tab.
- Export to CSV (respects current filters).
- Empty state for employees who have **no KRAs yet** (toggle: "Show only employees without any KRA") — this is the real value-add for spotting missed new joiners.

## Data source (read-only, no schema change)
Derived per employee from existing tables:

- `bundle_assignment_logs` — earliest row per `employee_id` → Source = `Bundle`.
- `kpi_audit_logs` where `action = 'KPI_CREATED'` — earliest row per employee (joined via `kpis.employee_id`) → Source inferred from `metadata` (`bundle` / `smart` / `manual` / `rollover` / `import`), falling back to `Manual`.
- `kra_rollover_logs.details` JSONB — used only to attribute Source = `Rollover` when the earliest KPI_CREATED falls inside a rollover run window.
- Employee master (`profiles`) — for name/code/DOJ/org scope + "no KRA yet" detection via LEFT JOIN on `kpis`.

The "first rollout" per employee = `MIN(created_at)` across the union of the two log sources.

## Technical section
- New SECURITY DEFINER RPC `public.get_first_kra_rollout(...)` with params: `p_search`, `p_company_id`, `p_bu_id`, `p_dept_id`, `p_from`, `p_to`, `p_source`, `p_only_missing bool`, `p_limit`, `p_offset`. Returns rows + `total_count`. Server-side pagination + filtering (per project rule §13).
- Grants: `EXECUTE` to `authenticated`; internal role check limits to Admin / HR PMS / Management (reuses `has_role`).
- Frontend:
  - `src/pages/admin/reports/FirstKraRolloutReport.tsx`
  - `src/hooks/useFirstKraRollout.ts` (react-query, 60s stale)
  - `src/services/reports/firstKraRollout.ts` (thin RPC wrapper + CSV builder)
  - Menu entry added under Admin → Reports (via existing menu registry — no hardcoding).
- Tests: unit tests for source-inference + CSV builder; RPC pgTAP-style test for pagination + role gating.
- Docs: append section to `DOCUMENTATION.md` (Reports) and note in `POLICY.md` that first-KRA attribution is derived, immutable, and read-only.

## Risk & Impact
- **Data**: additive only — no schema/RLS changes to existing tables. New RPC is read-only.
- **Workflow**: none — purely a reporting surface.
- **UI**: new page + one menu item; no existing screen changes.
- **Regression risk**: low; isolated module.
- **Scalability**: server-side paginated RPC with indexed lookups on `employee_id` + `created_at`. Safe for tens of thousands of employees.
- **Rollback**: drop the RPC + delete the new files; menu entry removes itself.

## Out of scope (ask separately if wanted)
- Editing / back-dating first-rollout attribution.
- Email alerts for "new joiner without KRA for N days".
- Bulk-assign action from within this report (already exists in Late Joiner Backfill).

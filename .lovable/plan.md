## RCA — "Assigned Workflow" column is wrong

### What you'll see vs what's true

The Excel export shows **the same chain** (`Self → L1 → Skip → HR PMS → Auditor → Mgmt`) for **every row**, regardless of the employee's actual workflow template. Live database confirms employees are on **at least 5 distinct workflow chains** in the current period (e.g., `Self → L1 → Auditor`, `Self → HR PMS`, `Self → L1 → HR PMS`, `Self → Audit → Mgmt`, `Self → L1 → Skip → HR PMS`). The export ignores all of this.

### Root cause

In the `get_kpi_journey_report` RPC (current production version, migration `20260425115401_*.sql`), the `emp_workflow` CTE hardcodes a constant array for every employee instead of resolving the per-employee template:

```sql
-- WRONG (current)
emp_workflow AS (
  SELECT DISTINCT
    pg.employee_id,
    ARRAY['self_review','manager_check','skip_level_check',
          'hr_pms_review','audit','management_review']::text[] AS stages
  FROM page pg
)
```

Because the array is a constant, `workflow_chain` joins always produce the maximal six-stage label. The RPC never calls `get_bulk_employee_workflows` (the canonical resolver used everywhere else in the app — reviewer grids, bottleneck report, admin data entry) which honours `workflow_config` overrides, period scope, and the `kra_set / approved` framing stages.

This is the same class of defect as BUG-031 (RPC built in isolation, ignoring the canonical helper), and the existing test BUG-024 only checks that the column exists in the export — it does not check correctness against per-employee config. That is why the regression slipped through.

### Other reports — RCA scope check

I scanned all server-side report functions for the same anti-pattern (hardcoded stage arrays bypassing `get_bulk_employee_workflows` / `get_employee_workflow`):

- `useBottleneckReport`, reviewer grids, `useAdminDataEntry`, `usePendingSelfReviews`, `useOrgKpiAuditReview` — all already use `get_employee_workflow` / `get_bulk_employee_workflows`. **Correct.**
- `get_kpi_journey_report` — **only offender** (the `emp_workflow` CTE).

So the bug is isolated to the KPI Journey export.

## Fix

### 1. Database migration — redefine `get_kpi_journey_report`

Replace the hardcoded `emp_workflow` CTE with a real per-employee resolution by joining to `get_bulk_employee_workflows(...)` over the `page` employee set, scoped to the report's `(p_period, p_year)`:

```sql
emp_workflow AS (
  SELECT bw.employee_id, bw.stages
  FROM get_bulk_employee_workflows(
    ARRAY(SELECT DISTINCT employee_id FROM page),
    p_period, p_year
  ) AS bw
)
```

Then `workflow_chain` keeps its existing label mapping (`self_review→Self`, `manager_check→L1`, `skip_level_check→Skip`, `hr_pms_review→HR PMS`, `audit→Auditor`, `management_review→Mgmt`) but explicitly **filters out framing stages** (`kra_set`, `approved`) since those are not user-facing review steps. Order is preserved via `WITH ORDINALITY`. If an employee has no resolved template, fall back to the previous default.

Everything else in the RPC stays unchanged.

### 2. Regression test — `BUG-033` in `src/test/bugBountyFixes.test.ts`

Pin the new migration text against three contracts:
- Calls `get_bulk_employee_workflows` with `(p_period, p_year)`.
- Excludes `kra_set` and `approved` from the rendered chain.
- The wrong-form constant `ARRAY['self_review','manager_check','skip_level_check','hr_pms_review','audit','management_review']` is no longer present.

(BUG-024 is left in place; it still asserts the export carries the column.)

### 3. Documentation & policy

- `DOCUMENTATION.md` v2.66.7.35 — describe the RCA and fix.
- `POLICY.md` — append a rule under §104 (or a new §105): any RPC that emits a per-employee workflow chain MUST resolve it via `get_bulk_employee_workflows` / `get_employee_workflow`. Hardcoded stage arrays in report RPCs are forbidden.
- Memory: add a small architecture note pointing future RPC authors at the canonical resolver.

## Risk & Impact Report

| Area | Impact |
|---|---|
| Data | None (read-only RPC; output now matches the per-employee template that the rest of the app already uses) |
| Workflow | None |
| UI/UX | Excel "Assigned Workflow" column becomes accurate and varies per employee |
| Performance | One extra set-returning function call per export page; `get_bulk_employee_workflows` is the same call the reviewer grid already makes for hundreds of employees, so cost is acceptable |
| Regression | Low. Other reports already use the canonical resolver, so this aligns the journey RPC with established patterns. The new test pins the contract |
| Mitigation | New BUG-033 test + policy rule prevent the hardcoded-array anti-pattern from returning |

## Files to change

- `supabase/migrations/<new>_fix_kpi_journey_per_employee_workflow.sql`
- `src/test/bugBountyFixes.test.ts` (add BUG-033)
- `DOCUMENTATION.md` (v2.66.7.35 entry)
- `POLICY.md` (workflow-chain resolution rule)
- `mem/architecture/database/...` (small memory note) and `mem/index.md`

## Out of scope

- Changing the on-screen KPI Journey table (export-only column, per BUG-024).
- Re-labelling the stage tokens (Self/L1/Skip/HR PMS/Auditor/Mgmt are kept).

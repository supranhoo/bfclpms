# Phase 2 — Restore 106 Period-Specific Workflow Overrides

## Context
- Phase 1 restored **71 Global** `workflow_config` rows from `Workflow_Configuration_Report_1.xlsx` (✅ done).
- The same file's `Employee Overrides` sheet also contains **106 Period-Specific rows**, each with a valid `Employee Code`, `Assigned Template`, `Review Period` (month name), and `Review Year` (e.g. Ankit: Feb 2026 = `Self + L1 + HR PMS`, Mar 2026 = `Self + L1 + Audit`).
- The DB resolver does NOT carry-forward across months. A month with no `workflow_config` row falls back to the Global override (just restored in Phase 1). The export already captured every period override as a literal row, so restoring those 106 rows faithfully reproduces the pre-incident state.

## Risk & Impact
- **Data**: Inserts 106 rows into `public.workflow_config` with `config_type='employee'`, `review_period=<month>`, `review_year=<int>`, `is_ongoing=false`. No schema changes. Idempotent via `ON CONFLICT (workflow_config_period_unique) DO UPDATE`.
- **Workflow**: After insert, in-flight April/May/June 2026 KPIs for the affected ~80 employees may now resolve to a different template than they did 30 min ago. Reconciliation auto-advances or rolls back stages to align — same mechanism Phase 1 used. Approved KPIs untouched.
- **UI**: None — read-only consumers (`get_employee_workflow`, dashboards) just see the restored rows.
- **Regression risk**: Low. Triggers `trg_workflow_change_step_back` and `trg_repercolate_on_workflow_config_change` are disabled during the bulk insert (same pattern as Phase 1) to prevent cascading `kpis.status` thrash. Re-enabled before commit.
- **Mitigation**: Pre-flight validates every (employee_code → profile, template_name → template_id, month name → canonical period token). Aborts on any unmatched row, listing them in the migration output.

## Execution

### Step 1 — Parse & stage (locally, no DB writes)
Build `(employee_id, template_id, review_period_token, review_year)` tuples from the XLSX, normalising:
- Month → canonical period token (`February` → `February`, already matches `review_periods` constant).
- `Assigned Template` display name → `workflow_templates.id` via case-insensitive match on `display_name` (trim whitespace; the file has known double-space artifacts like `"Self + L1  + HR PMS"` and `"Self + L1 +Audit"`).
- `Employee Code` → `profiles.id` via `employee_code` (already validated in Phase 1; same 71 employees plus the period-only ones).

Load into staging table `_workflow_config_restore_2026_05_19_ps` (col: emp_code, emp_id, template_display, template_id, review_period, review_year). Abort if any row has NULL emp_id or template_id and surface the list.

### Step 2 — Migration
```sql
ALTER TABLE public.workflow_config DISABLE TRIGGER trg_workflow_change_step_back;
ALTER TABLE public.workflow_config DISABLE TRIGGER trg_repercolate_on_workflow_config_change;

INSERT INTO public.workflow_config
  (config_type, config_value, template_id, review_period, review_year, is_ongoing, created_at, updated_at)
SELECT 'employee', emp_id::text, template_id, review_period, review_year, false, now(), now()
FROM _workflow_config_restore_2026_05_19_ps
ON CONFLICT ON CONSTRAINT workflow_config_period_unique
DO UPDATE SET template_id = EXCLUDED.template_id, updated_at = now();

ALTER TABLE public.workflow_config ENABLE TRIGGER trg_workflow_change_step_back;
ALTER TABLE public.workflow_config ENABLE TRIGGER trg_repercolate_on_workflow_config_change;

DROP TABLE _workflow_config_restore_2026_05_19_ps;
```

### Step 3 — Reconcile affected periods
Run `reconcile_workflow_statuses(p_review_period, p_review_year)` once per distinct (period, year) pair present in the 106 rows. Likely just a handful of (Apr/May/Jun 2026) calls plus any historical ones (Feb/Mar 2026).

### Step 4 — Verification
- `SELECT count(*) FROM workflow_config WHERE config_type='employee' AND review_period IS NOT NULL` = expected pre-incident PS count + any new ones added since. Compare to 106 from XLSX.
- Spot-check Ankit: `get_employee_workflow(<ankit_id>, 'February', 2026)` → `Self + L1 + HR PMS`; `get_employee_workflow(<ankit_id>, 'March', 2026)` → `Self + L1 + Audit`; `get_employee_workflow(<ankit_id>, 'April', 2026)` → Global (`Self + L1 + HR PMS`).
- Pick 5 random period-specific rows and verify resolver matches XLSX.
- KPI row count unchanged (insert touches `workflow_config` only).

### Step 5 — Memory & docs
- Add note to `mem://features/admin/workflow-configuration-report` that the export carries both Global and Period-Specific rows and is the canonical recovery artifact.
- Append an ADR entry referencing the May 19 incident and the two-phase restore.

## Out of scope (deferred)
- **Phase 3 export bug fix** in `src/components/admin/WorkflowConfigExport.tsx` — defensive write of employee identifiers + period/year. This file's export is already correct, so Phase 3 is precautionary only; will be filed as a separate ticket.

## Goal
Reverse the "everyone got Skip-Level" symptom by restoring the per-employee Global workflow overrides that were wiped on 2026-05-19 at 19:21 UTC.

## Source of truth
`Workflow_Configuration_Report_1.xlsx` (uploaded). Employee Overrides sheet: **178 rows total**, 177 with employee codes.
- **72 Global** rows → fully restorable (no period/year needed).
- **106 Period-Specific** rows → NOT restorable from this file (Review Period and Review Year both `—`). Deferred to Phase 2.

## Phase 1 — Restore Global overrides (now)

### Step 1. Stage the file into the DB
Parse the XLSX locally, build a CSV of:
`employee_code, template_display_name`
…for the 72 Global rows, and load it into a temporary staging table `_workflow_config_restore_2026_05_19` via `psql COPY`.

### Step 2. Pre-flight validation (read-only)
Before any write, confirm:
- Every `employee_code` in the staging table resolves to exactly one active `profiles.id`.
- Every `template_display_name` resolves to exactly one row in `workflow_templates` (active or archived).
- Report any unmatched rows back to you. **Do not proceed unless all 72 resolve.**

### Step 3. Disable cascading triggers (migration)
Temporarily disable on `public.workflow_config`:
- `trg_workflow_change_step_back`
- `trg_repercolate_on_workflow_config_change`

This prevents the re-insert from triggering a fresh global `kpis` rewrite.

### Step 4. Re-insert the 72 Global rows (data write)
```
INSERT INTO public.workflow_config
  (config_type, config_value, workflow_template_id, review_period, review_year, is_ongoing)
SELECT 'employee', p.id, t.id, NULL, NULL, false
FROM _workflow_config_restore_2026_05_19 s
JOIN profiles p ON p.employee_code = s.employee_code
JOIN workflow_templates t ON t.display_name = s.template_display_name
ON CONFLICT ON CONSTRAINT workflow_config_global_unique
DO UPDATE SET workflow_template_id = EXCLUDED.workflow_template_id,
              updated_at = now();
```

### Step 5. Re-enable triggers (migration)
Re-enable both triggers immediately after Step 4 completes.

### Step 6. Reconcile April 2026 statuses
Run `reconcile_workflow_statuses(p_review_period := 'April', p_review_year := 2026)`. This re-aligns any in-flight KPI whose current `status` no longer matches its newly-restored template (e.g. removes "awaiting skip-level" for employees whose Global template has no Skip-Level stage). It leaves `approved` rows alone.

### Step 7. Verification (read-only)
- `SELECT count(*) FROM workflow_config WHERE config_type='employee' AND review_period IS NULL;` → expect **72**.
- Per-template breakdown matches the XLSX expectation.
- Spot-check **Ankit (`535d9a14-e4aa-4676-af92-f535373ffc8d`)** + 4 random employees from the file: resolved workflow on dashboard matches the template named in the XLSX, no Skip-Level if absent.
- `SELECT count(*) FROM kpis;` unchanged vs pre-Step 4 count (proves no cascade fired).
- Drop the staging table.

## Phase 2 — Period-Specific overrides (deferred)
The 106 Period-Specific rows cannot be restored from this file. Two options to unblock:
1. **Lovable Cloud PITR**: request a snapshot of `public.workflow_config` at ≤ 2026-05-19 19:20 UTC. Re-run Steps 3–6 scoped to those rows.
2. **Older export**: any pre-19:21 XLSX/CSV that includes the `Review Period` + `Review Year` columns.

Until then, those 106 employees fall back to their newly-restored Global template, which is correct for 72 of them and still wrong for ~34 who relied on period overrides. Acceptable interim state vs the current "everyone gets Skip-Level".

## Phase 3 — Export bug fix (small follow-up)
Patch `src/components/admin/WorkflowConfigExport.tsx` so the Employee Overrides sheet:
- Always populates Employee Name / Code / Email (current export sometimes writes `—` even when profile exists).
- Always writes the actual `review_period` and `review_year` for period-scoped rows.

This is unrelated to the restore but prevents the same data-loss-with-no-recovery situation if it happens again.

## Risk & Impact Report
- **Data Impact**: 72 INSERTs into `workflow_config`. No other table written. Triggers disabled only for the duration of one transaction.
- **Workflow Impact**: Restores the pre-wipe reviewer chain for ~72 employees. Removes spurious Skip-Level / HR PMS stages they shouldn't see.
- **UI/UX**: No code change in Phase 1. Phase 3 is a UI tweak with no behavior change.
- **Regression Risk**: Low. Triggers re-enabled in same migration. `reconcile_workflow_statuses` is scoped to April 2026 and skips `approved` rows.
- **Mitigation**: Pre-flight validation (Step 2) aborts before any write if anything is unmatched. KPI count check (Step 7) catches accidental cascades.

## What I need from you to start
- Confirm Phase 1 only (defer 106 period-specific rows), or wait until you also have a PITR snapshot and do both in one shot.

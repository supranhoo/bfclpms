## Security hardening — employee self-update RLS

Scope: monthly KPI review only. Annual Review paths unchanged.

### Fix 1 — `public.kpis`
Replace the current `Users can update their own KPIs` policy with a stage-gated, column-scoped version.

- **USING**: `employee_id = auth.uid() AND status IN ('kra_set','draft')`
- **WITH CHECK** (via BEFORE UPDATE trigger `tg_kpis_employee_column_guard`, invoked only when `auth.uid() = employee_id` AND caller is not admin/hr_pms/manager): raise if any of these columns changed
  - `status`, `weightage`, `target_value`, `criteria`, `scoring_config`, `frequency`, `frequency_config`, `is_org_level`, `is_na`, `manager_id`, `category_id`, `kra_name`, `kpi_name`, `uom`, `review_period`, `review_year`, `weightage_locked`, any score column (`final_score`, `manager_score`, `auditor_score`, etc. if present on the row)
- Employees may still edit: `description`, `remarks`, evidence pointers on their own KPI while in KRA-set.
- Admin / HR PMS / manager / auditor / management / skip-level paths unaffected (separate policies).

### Fix 2 — `public.review_submissions`
Replace `Employees can update self review fields` and `Employees can create/update their own submissions` with one stage- and column-gated policy.

- **USING**: exists a `kpis` row where `kpi_id = kpis.id AND employee_id = auth.uid() AND status = 'self_review'`
- **WITH CHECK** (via BEFORE UPDATE trigger `tg_review_submissions_self_column_guard`, when `auth.uid()` is the employee and not admin/hr_pms/reviewer): reject the update if any non-self column changed. Allowed columns:
  - `self_score`, `self_remarks`, `self_achieved_value`, `self_evidence`, `self_submitted_at`, `self_submitted_by`, `updated_at`
  - INSERT: employee may only insert a row with those same columns populated, all reviewer columns NULL.
- Reviewer / auditor / manager / HR / management / skip policies unchanged.

### Migration structure
1. Create both trigger functions (SECURITY DEFINER, `SET search_path = public`, use `TG_OP='UPDATE'`).
2. Attach `BEFORE UPDATE` triggers.
3. Drop the offending permissive policies. Recreate with the stage-gated USING / WITH CHECK.
4. Verify no existing rows violate the new invariants (audit query in the same migration).

### Regression tests
- `src/test/security/kpiEmployeeSelfUpdateGuard.test.ts` — employee cannot flip `status`, cannot change `weightage`, `target_value`, `criteria`; can edit `remarks` when status=`kra_set`; blocked when status=`approved`.
- `src/test/security/reviewSubmissionSelfGuard.test.ts` — employee cannot write `manager_score`, `auditor_score`, `final_score`; can write `self_score` when kpi.status=`self_review`; blocked in other stages.

### Docs
- POLICY.md new §KPI-EMPLOYEE-SELF-UPDATE-GUARD and §REVIEW-SUBMISSION-SELF-UPDATE-GUARD.
- DOCUMENTATION.md v2.66.106 bullet listing the two policies and the two triggers.
- Mark both findings `mark_as_fixed` with explanation.

### Risk & Impact
- **Data**: none — RLS + trigger only. No row rewrites.
- **UX**: legitimate employee flows (self-review submission, KRA editing during KRA-set window) preserved. Any client code accidentally writing reviewer columns from the employee path will now surface a clear DB error — that IS the intended regression signal.
- **Rollback**: `DROP TRIGGER … ; DROP FUNCTION …;` and restore previous policies from git history.

Proceeding requires switching to build mode.
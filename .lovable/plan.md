## Assumptions
- Manoj Kumar Mahato (100735) currently has **0 KPIs** for June 2026 (verified in DB).
- Akbar (100763) has **24 KPIs** for June 2026 totalling **100% weightage** (verified in DB).
- The red "No KPIs to copy (all duplicates)" toast in the screenshot was produced against a stale in-flight state (either before the deletion completed, or the dialog was still mounted with its earlier cache when the button was clicked). A fresh open of the dialog would re-fetch and succeed.

## Risk & Impact Report
- **Data Impact:** Inserts 24 new rows into `public.kpis` for Manoj, June 2026, `status = kra_set`. No update or delete of existing data. No Org-KPI rows are affected (Akbar's June set contains no `is_org_level=employee` KPIs that need an `org_kpi_values` placeholder — will re-verify in the copy step and only insert if present).
- **Workflow Impact:** Manoj's June review starts at `kra_set` — matches normal issuance state.
- **UI/UX Impact:** None; user simply sees KPIs appear on Team Reviews / My KPIs.
- **Regression Risk:** Low — direct data copy scoped to one employee + one period.
- **Mitigation:** Wrap in a single transaction with a pre-check that Manoj has 0 June-2026 KPIs; abort if any exist. Emit `KRA_COPIED` audit rows into `kpi_audit_logs` for traceability.

## Plan
1. **Re-verify** immediately before insert: `SELECT count(*) FROM kpis WHERE employee_id = Manoj AND review_period='June' AND review_year=2026` — must return 0. Abort otherwise.
2. **Insert** all 24 Akbar June-2026 KPI rows into `kpis` for Manoj, copying every configuration column (category, kra_name, kpi_name, target_value, uom, uom_type, weightage, frequency, sub_frequency, criteria, source_of_data, r0–r5, threshold_mode, qualitative_options, is_org_level, org_level_scope, ref_code, day_count_type, frequency_cycle_start, require_resubmit_reason). Set `status='kra_set'`, `review_period='June'`, `review_year=2026`, fresh `id`, `created_at=now()`.
3. **Org-KPI placeholder:** for any inserted row where `is_org_level=true AND org_level_scope='employee'`, upsert an `org_kpi_values` placeholder mirroring the existing Copy KRAs behaviour.
4. **Audit:** insert a `kpi_audit_logs` row per copied KPI (`event_type='KRA_COPIED'`, `source=admin_manual_copy_akbar_to_manoj_june_2026`).
5. **Verify post-copy:** count Manoj's June-2026 KPIs = 24 and total weightage = 100.

## UI Changes
Not Applicable — data-only operation.

## Tests / Verification
- Pre-insert SELECT (Manoj = 0).
- Post-insert SELECT (Manoj count=24, sum weightage=100).
- Manager reload of `/annual-review/team/…` should list all 24 KRAs at `kra_set`.

## Documentation / Policy Updates
Not Applicable — no new policy or code path; existing Copy KRAs semantics are preserved. If the stale-toast pattern recurs, we will file a follow-up to force `queryClient.removeQueries` on dialog close (currently only `invalidateQueries` runs on success).

## Rollback
Single DELETE scoped to `employee_id = Manoj AND review_period='June' AND review_year=2026 AND created_at >= <insert timestamp>` reverses the entire operation.

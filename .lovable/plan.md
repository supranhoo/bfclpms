## Investigation result

The gap of **3 KPIs (595 − 592)** in the HR PMS dashboard for **March 2026** is fully isolated to one employee:

**Lekh Raj — Employee Code 101959**

| # | KRA | KPI | Status | hr_pms_score | is_na | auto_advance_reason |
|---|---|---|---|---|---|---|
| 1 | Employee Wellness & Health Promotion | Health Education Program Outreach | `approved` | NULL | false | "Scored by Admin on behalf of hr_pms" |
| 2 | Statutory Compliance | On-Time Submission of Accident/Occupational Disease Reports | `approved` | NULL | false | "Scored by Admin on behalf of hr_pms" |
| 3 | Training & Development | Continuing Medical Education (CME) for Medical Staff | `approved` | NULL | false | "Scored by Admin on behalf of hr_pms" |

### Root cause

An Admin used "score on behalf of HR PMS" on these 3 KPIs and advanced them through to `approved` **without writing an `hr_pms_score` value and without setting `is_na = true`**. Lekh Raj's other 19 March-2026 KPIs were correctly N/A-stamped by the same code path (those rows credit toward the 592 reviewed). Counter logic is correct — the data itself is incomplete for these 3.

This is a write-side gap in the admin-on-behalf flow that lets a KPI exit the `hr_pms_review` stage with neither score nor N/A flag.

## Risk & impact report

- **Data impact**: 3 `review_submissions` rows need backfill; one workflow `kpis` row each may need a status review. No schema change.
- **Workflow impact**: KPIs are already `approved` — repair must not regress them. Final-score immutability (POLICY §72/§80) must be respected. No `final_score` is set on these rows, so no immutable value is at risk.
- **UI impact**: After repair, "HR PMS Reviewed" rises from 592 → 595, matching "Total KPIs" for the period.
- **Regression risk**: Low if repair is scoped to these 3 kpi_ids. Higher if we change the on-behalf write path without tests.

## Two arms — your choice required

### Arm A: Data repair only (fast, surgical)

1. **Migration `repair_lekh_raj_march_2026_hr_pms_gap.sql`** — set `is_na = true`, `na_marked_by_role = 'admin'`, refresh `auto_advance_reason` to `"Repaired: admin advanced past HR PMS without scoring (BUG-047)"` for the 3 specific kpi_ids. Idempotent (only updates rows still matching the broken signature).
2. **Insert audit rows** into `kpi_audit_logs` with `performed_by = NULL` (per memory: automated actions = system-attributed).
3. **DOCUMENTATION.md** bump to v2.66.7.49; **POLICY.md** §116 — "Admin-on-Behalf must write a score or N/A flag".

### Arm B: Repair + permanent guardrail (recommended)

Everything in Arm A, plus:

4. **DB trigger `enforce_on_behalf_score_or_na`** on `review_submissions` — when a KPI advances past `hr_pms_review` (or any reviewer stage) via the on-behalf path, raise an exception unless the corresponding stage score column OR `is_na = true` is set. Mirrors the `manager_score / auditor_score / management_score` stages too.
5. **Client guard** in the admin "Score on behalf of" dialog — disable Submit until a score, rating, or N/A toggle is provided; show inline validation.
6. **Memory update** — extend `mem/features/admin/admin-data-entry-workflow-controls` with this rule.
7. **Regression test** in `src/test/bugBountyFixes.test.ts` (BUG-047) — assert the repaired rows credit toward `reviewed`, and assert the trigger rejects empty on-behalf submissions.

## Files touched (Arm B)

- new migration `supabase/migrations/<ts>_bug047_hr_pms_onbehalf_guardrail.sql`
- `src/components/admin/...` (the on-behalf dialog component — to be located during implementation)
- `src/test/bugBountyFixes.test.ts`
- `POLICY.md`, `DOCUMENTATION.md`
- `mem/features/admin/admin-data-entry-workflow-controls`

## Decision needed

Reply with **A** (data repair only), **B** (repair + permanent guardrail — recommended), or describe a different preference. Once approved I'll implement in default mode.

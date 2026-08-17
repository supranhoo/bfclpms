# Recover Dilip Kumar Ojha's KRA set finalised on 29 Jun 2026

## What the data shows (verified)

- Employee: Dilip Kumar Ojha, code 100020, Senior Assistant General Manager — active.
- His **July 2026** KPI set contains 25 rows, created in two distinct batches:
  - **22 KPIs created 29 Jun 2026 at 13:02 UTC (18:32 IST)** — this is the batch you finalised.
  - **3 KPIs created 1 Jul 2026 at 00:00 UTC** — added by the automatic rollover (DM Water Quality Compliance, Reduce Remelt % (SMS), Quality Deduction Accuracy (SMS)).
- So the rollover **added** rows, it did not overwrite your set. The 22-row batch is fully recoverable by creation timestamp.

## Deliverable

A single Excel file with the 22 KRAs/KPIs finalised on 29 Jun 2026, in the same column layout as the in-app **KRA Export**:

Sr | Category | KRA | KPI | UOM | Target | Weightage | Criteria | Rating 5 | Rating 4 | Rating 3 | Rating 2 | Rating 1 | Rating 0 | Frequency | Source

Plus a header block (employee name, code, designation, department, period July 2026) and a footer note stating the snapshot basis ("KPIs created 29 Jun 2026 13:02 UTC").

A second sheet, **Added by Rollover**, lists the 3 rows the 1 Jul auto-rollover inserted, so you can decide whether to keep or remove them.

## How it will be produced

- Read-only query against `kpis` for `employee_id = Dilip Ojha`, `review_period = 'July'`, `review_year = 2026`, split on `created_at`.
- Rows written with the same field mapping the app's KRA Export uses (`src/lib/kraExport.ts`), so the file is visually identical to a normal KRA Export.
- File written to `/mnt/documents/KRA_Dilip_Kumar_Ojha_July_2026_finalised_29Jun.xlsx` for download.

## Notes / limits

- Weightage and definitions are read from the KPIs' **current** state. Their definition fields have not been re-authored since creation (only status/score updates on 15 Aug), so this equals the 29 Jun content. If you want a strict field-level historical diff, that needs a separate pass over `kpi_audit_logs`.
- No data is modified. Nothing in the app changes; this is an export only.

## Scores and post-finalisation changes (verified)

Two different things happened to this July 2026 set, and the export will show both.

**1. Your 29 Jun editing session (18:32–18:44 IST)**
- 22 KPIs created at 13:02 UTC, then **11 of them edited** via the admin edit dialog (`ADMIN_OVERRIDE` rows, 13:08–13:44 UTC). Those edits changed KPI text, target, UOM, weightage, criteria and the R5–R0 ladder — the audit trail holds the exact before/after for each.
- 7 org-linked KPIs auto-inherited org values the same evening.

**2. After 1 July**
- The auto-rollover **added 3 new KPIs** on 1 Jul 00:00 (DM Water Quality Compliance, Reduce Remelt % (SMS), Quality Deduction Accuracy (SMS)) — it did not alter the 22.
- Scoring happened in August: 24 of 25 KPIs now carry self + manager scores (identical values, manager forwarded), 1 KPI — *Audit Non-Compliance Closure within 7 days* — is still at `kra_set` with **no score at all**.
- 2 KPIs were sent back to the employee and 1 rollback was requested and approved (5 Aug).
- Score values today range 0 to 5; several sit at 0 (MIS accuracy, By-Product levels, common-Policy adherence, Reduce Remelt).
- No definition (weightage/target/ladder) edits are recorded after 29 Jun — the current definitions equal what you finalised.

## Updated deliverable — 4 sheets

1. **KRA Sheet (as finalised 29 Jun)** — the 22 KPIs in standard KRA Export layout (Sr, Category, KRA, KPI, UOM, Target, Weightage, Criteria, R5–R0, Frequency, Source).
2. **Scores** — per KPI: achieved value, self score, manager score, final score, current status, date submitted.
3. **Changes since finalisation** — every audit event on these KPIs after 29 Jun 13:02: what changed, old → new, who, when (admin overrides, send-backs, rollback, org propagation, status moves).
4. **Added by Rollover** — the 3 KPIs the 1 Jul auto-rollover inserted, so you can keep or drop them.

Delivered as `/mnt/documents/KRA_Dilip_Kumar_Ojha_July_2026_finalised_29Jun.xlsx`. Read-only; no app or data changes.

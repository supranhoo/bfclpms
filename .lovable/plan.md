

## RCA — Half-propagated Org KPIs across March 2026

### Yes — the same bug affects multiple KPIs, not just Biswajit's.

Querying the entire org for March 2026 with the half-propagation signature (`kpis.status='kra_set'` + `org_kpi_values.status` in (`propagated`,`approved`) + `achieved_value` present + **no** `review_submissions` row):

| Scope | Count |
|---|---|
| Total half-propagated rows (March 2026) | **25** |
| Distinct KPIs affected | **13** |
| Distinct employees affected | **20** |
| Same pattern in Feb 2026 | 1 row |
| Older periods | 0 |

### KPIs affected in March 2026

| KPI | Employees stuck |
|---|---|
| Handle all breakdowns and minimize downtime to achieve production Target | 4 |
| Raw Material Plan & Other MIS | 4 |
| Refractory life - Campaign life tonnage wise | 4 |
| Ensure target availability of furnace and all equipment | 3 |
| Keep Inventory below 300T | 2 |
| Achieve production target from 3X100 TPD | 1 |
| Consumable cost | 1 |
| Enhance Campaign life of 1050 TPD | 1 |
| Enhance Campaign life of 3x100 | 1 |
| Ensure target availability of furnace and all associated equipment | 1 |
| Furnace & Equipment Availability | 1 |
| Mechanical Availability of Critical Equipment | 1 |
| Pending metal for jigging Inventory below 5T | 1 |

The "Handle all breakdowns…" / "Achieve org production target" KPI alone has 4 stuck employees from a single Propagate click on 21-Apr — confirming the bug is current, not just historical.

### What this means
- The forward-guard already shipped (v2.65.6) prevents **new** half-propagations from this point forward.
- These 26 existing rows (25 March + 1 February) need the **one-time backfill** that Part 2 of the prior plan covered. Until that runs, all 20 employees see "Pending" in the Scorecard Detail report and their dashboards even though the data was entered and Propagate was clicked.

---

## Plan — run the existing repair tool against this scope

### What to do (no new code)
The repair tool already exists at **Admin Settings → Data Repair → "Repair Orphaned Propagations"** (edge function `repair-orphaned-propagations`, source already in `supabase/functions/`). It's designed for exactly this signature.

Steps:
1. Open Admin Settings → Data Repair.
2. Run the tool in **scan mode** first (dry-run). Expect ~26 rows listed across March + February 2026.
3. Review the dry-run output. Confirm the listed `(employee, KPI, achieved_value)` triples match the table above.
4. Re-run in **repair mode**. The tool will:
   - Create the missing `review_submissions` row from the stored `achieved_value`.
   - Compute `self_score` and `self_rating` from the KPI's thresholds.
   - Advance `kpis.status` from `kra_set` → `self_review`.
   - Write a `kpi_audit_logs` entry per repaired KPI.
5. Verify: the "KPI Scorecard Detail" report's pending count for these 20 employees drops by the corresponding number of rows; their dashboards now show the propagated values.

### Files touched
None. Repair tool already shipped.

### Risk & Impact
- **Data:** creates 26 `review_submissions` rows from existing `org_kpi_values` data; advances 26 `kpis` rows. Reversible via existing rollback. Audit-logged.
- **Workflow:** affected employees' KPIs jump from "KRA Set" → "Self Review" with pre-filled propagated values — exactly the state they should have been in if Propagate hadn't half-failed.
- **Regression risk:** zero. Tool was used previously; logic unchanged.
- **Scope:** narrow — only the 26 rows matching the half-propagation signature are touched.

### Out of scope
- No code changes. Forward-guard already in place from v2.65.6.
- No DB migration. Repair runs through the existing edge function.
- No report changes. Report is correct; counts will resolve naturally after repair.

### Recommendation
Run the existing repair tool. Dry-run first, confirm 26 rows, then repair. That fully closes the loop opened in v2.65.6.


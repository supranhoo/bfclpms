# Why "Adherence to Manning Norms" is hidden for Sindhu Raj Singh

## 1. RCA (verified against live DB)

**The KPI does exist.** For May 2026 there is a `kpis` row for Sindhu Raj Singh (100042 / `66b76d0c…c99b`):
- KPI id `e0c12404-1cf1-438f-83a8-583bc6291404`
- `is_org_level = true`, `status = self_review`, KRA "Adherence to Monthly Budget".

**It is being hidden by the "My scope only" toggle** (default ON for auditors — see `mem/features/review/bulk-review-auditor-scope-filter.md`). Auditor scope is the union of:
- `audit_kpi_assignments` (employee-level) → Ayush Bansal has exactly **1**: Abhas Luharuwalla.
- `audit_kpi_level_assignments` (KPI-level) → Ayush has 358 rows; for KPI name "Adherence to Manning Norms" only **5 employees** are assigned (Dilip Ojha, Abhas, Sajid Raza, Parshu Ram, Jitendra Dwivedi). Sindhu Raj Singh is **not** in that set.

That is why the column for Sindhu Raj Singh shows `—` (filtered out, not "pending"). Other employees on the same row show PENDING because they're in the 5 assigned above.

→ **Root cause = an Audit Assignment data gap, not a workflow / propagation / RLS bug.** When this Org KPI was propagated to all mapped employees, the auditor coverage was not extended to the new employees.

## 2. Verification you can do right now (no code change)

Switch **"My scope only" OFF** on the Bulk Review header — Sindhu Raj Singh's column will immediately show the KPI as PENDING. That confirms the cell is being suppressed only by the auditor-scope filter.

## 3. CAPA

### Corrective (one-shot, data fix)
Add Sindhu Raj Singh to Ayush's KPI-level coverage for "Adherence to Manning Norms" (and any other org-level KPI that has the same coverage gap). Done from **Audit Delegation** → KPI-level → pick Manning Norms → tick the missing employees. No code change required.

### Preventive (code) — small, surgical
The repeating defect is: when an **Org KPI** is propagated to N employees, KPI-level auditor coverage stays at the old N-k. Two cheap, isolated guards:

1. **Auditor coverage badge on the auditor's row** *(UI-only, Bulk Review header)*
   When `My scope only` is ON, also show **"(K of N covered)"** per Org KPI in the row header tooltip. Today the chip shows `90 in my scope` globally — it doesn't tell the auditor which Org KPIs are partially covered, so silent gaps stay silent.

2. **Coverage-gap warning on the Org KPI Data Entry page** *(admin-facing)*
   After a successful propagate, if any propagated KPI ends up with `audit_kpi_level_assignments` rows that cover < propagated employees and no `audit_kpi_assignments` row covers the remainder, surface a non-blocking toast + a row-level "Audit coverage incomplete" pill linking to Audit Delegation pre-filtered to that KPI. Reuses `resolve_org_kpi_target_kpis` + a new read-only RPC `get_org_kpi_audit_coverage(p_kpi_name, p_period, p_year)`; no write paths touched.

Neither item changes the bulk-scoring scope contract (POLICY §… auditor-scope), only its **visibility** to the admin and the **diagnostic** to the auditor.

### Tests
- `src/test/bulkReview/auditScopeAndCategoryFilters.test.ts` — add a case: row with `kpi_id` not in `kpiIds` and `employee_id` not in `employeeIds` → `isRowInAuditorScope` returns `false` (regression lock for this exact case).
- New `src/test/orgKpiAuditCoverage.test.ts` — given (propagatedEmpIds, kpiLevelEmpIds, empLevelEmpIds) returns missingEmpIds (pure helper).

## 4. Risk & Impact
- **Data**: no DB writes from the code change (read-only RPC + UI). Manual data fix is a single Delegation save.
- **Workflow**: no change to scoring/propagation.
- **UI/UX**: one new tooltip line, one admin toast/pill. Both additive.
- **Regression**: low — predicate already isolated in `src/lib/bulkAuditScopeFilter.ts`.
- **Scalability**: coverage RPC is keyed on (kpi_name, period, year) with the same indexes the propagate path uses; O(N) over employees of the Org KPI (≤ ~150 today).

## 5. Doc updates
- `mem/features/review/bulk-review-auditor-scope-filter.md` — add "Org KPI coverage gap" diagnostic note.
- `mem/features/review/audit-delegation-system` — note the coverage warning surface.
- `POLICY.md` — append §… "Org KPI propagation MUST surface auditor coverage gaps."
- `DOCUMENTATION.md` — bump.

## 6. What I will NOT do
- Auto-assign auditors during propagate (changes governance — out of scope).
- Touch RLS or the snapshot RPC contract.
- Move the default of "My scope only" — auditors asked for it ON.

Awaiting approval before implementing the preventive code changes. The corrective data fix you can do today in Audit Delegation.

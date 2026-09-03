# Org KPI shows "Pending" although every active employee is entered & propagated

## Assumptions
- Symptom is on **Organization KPI Data Entry** (`/admin` → Org KPI Data Entry): the KPI card/chip counts the KPI under **Pending** while the card itself reports "7 of 7 entered / propagated".
- At least one employee mapped to that KPI definition is **inactive** (`profiles.is_active = false`) and their child `kpis` row is still at `kra_set`.

## Verified current state (queried before writing this plan)
- `public.get_org_kpi_data_entry_snapshot` filters `emp_active` for `employee_count`, `employee_ids`, `department_ids`, `mappedEmpIdsByKey`, `employeeDisplayMap`, `departmentDisplayMap` — **but not** for `kra_set_emp_ids` and `kra_set_kpi_rows` (function lines 92–105).
- Real data confirms the asymmetry. For 2026 org KPIs there are 23 KPI/period groups where **every** `kra_set` row belongs to an inactive employee while active rows are all past `kra_set` — e.g. August "Implement 5S practices" (126 active rows, 0 active `kra_set`, 1 inactive `kra_set`), July "Completion of Mandated Training Hours" (64 active rows, 1 inactive `kra_set`).
- Consumers of that unfiltered set:
  - `deriveOrgKpiTileStatus` (`src/lib/orgKpiStatus.ts`) — `isAlreadyAdvancedPastKraSet` returns false, and the org/department branches return **`stuck`** because `kraSetEmpIds.size > 0`.
  - `OrgKpiDataEntry.tsx:1881` — the **Pending chip count** is `total − entered − propagated`, so every `stuck` KPI is silently counted as Pending.
  - `OrgKpiDataEntry.tsx:1593 / 1619 / 1651` (Pending Report) and `:1179 / :1239` (post-propagate accounting) use the same set.
- The propagation RPC family (`preview_org_kpi_propagation`, `propagate_org_kpi_value`, `diagnose_org_kpi_propagation_gap`, `resolve_org_kpi_target_kpis`, `repair_org_kpi_entered_unpropagated_rows`) contains **no** `is_active` reference at all — inactive employees are silently treated as live propagation targets.

## Root cause
One definition of "the people this Org KPI covers" is enforced for *mapping/count* facts and a different, wider one for *workflow-stage* facts, inside the same RPC. An inactive employee therefore cannot appear in the numerator ("7 of 7") but still poisons the "is anything left to do" predicate, so the tile degrades to `stuck` and the Pending chip absorbs it.

## 5 Whys
1. Why is the KPI in Pending? Because the Pending chip is computed as `total − entered − propagated`, and the tile resolved to `stuck`.
2. Why `stuck`? Because `kraSetEmpIds` is non-empty for the definition.
3. Why is it non-empty when all 7 owners are done? Because it contains an **inactive** employee whose child row was never advanced.
4. Why does it contain an inactive employee? Because `get_org_kpi_data_entry_snapshot` applies the `emp_active` filter to the mapped/count aggregates only, not to `kra_set_emp_ids` / `kra_set_kpi_rows`.
5. Why was the filter applied inconsistently? "Active employee" is re-expressed as an inline predicate in each CTE instead of a single shared scope definition, so a later edit that added the active filter to mapping aggregates did not reach the stage aggregates.

## Why it was not caught so far
- Every existing guard test (`orgKpiTileStatus`, `orgKpiTileStatusChipParity`, `orgKpiScopedRowStatus`, `orgKpiStatusShared`) feeds `mappedEmpIds` / `kraSetEmpIds` as **hand-built sets** to the pure helper. They test the helper's arithmetic; none of them tests the RPC contract that produces those sets, so an inactive-only `kra_set` member is not representable in the current suite.
- ADR-055 / ADR-064 parity work focused on chip-vs-dialog drift for *active* rows; inactive employees were assumed absent from all snapshot outputs.
- The failure is silent by design: it renders as a *conservative* status (Pending/Stuck), never as an error or a failed action, so it is only reported when a user notices the mismatch.
- The Pending chip aggregates `stuck` into Pending, hiding the true label that would have pointed at the cause.

## Corrective action (fix this defect)
1. **Server (SSOT scope):** in `get_org_kpi_data_entry_snapshot`, introduce a single `active_base` CTE (`base` filtered by `emp_active`) and derive **all** aggregates from it — `kra_set_kpi_rows`, `kra_set_emp_ids`, `propagated_emp_ids`, `per_employee_targets`, `employee_kpi_ids` — so mapping facts and stage facts share one population. `CREATE OR REPLACE` only; signature unchanged (POLICY §DB-FUNCTION-SIGNATURES).
2. **Client (defence in depth):** `deriveOrgKpiTileStatus` intersects `kraSetEmpIds` with `mappedEmpIds` before evaluating `isAlreadyAdvancedPastKraSet` and the stuck checks, so an id outside the mapped population can never change the verdict even if a future/legacy payload leaks one.
3. **Chip honesty:** the Pending chip count becomes an explicit count of `getKpiStatus(k) === 'pending'` over the same open-window set, instead of `total − entered − propagated`, so `stuck` is never mis-labelled Pending again.
4. **Pending Report parity:** the three `isStuck` expressions use the mapped-intersected set, and the report keeps listing only active mapped assignments.

## Preventive action
5. **Propagation family:** `preview_org_kpi_propagation` / `propagate_org_kpi_value` / `diagnose_org_kpi_propagation_gap` skip rows whose employee is inactive, reporting reason `employee_inactive`; add that reason to the benign-skip set in `src/lib/orgKpiStatus.ts` (`ALREADY_DONE_REASONS`) and to the toast accounting in `usePropagateOrgKpiValue` so skips never surface as a destructive "mismatched KPI names" message.
6. **Policy:** add **POLICY §ORG-KPI-ACTIVE-POPULATION** — any Org KPI surface that derives status, counts or propagation targets must use one active-employee population; per-aggregate inline `is_active` predicates are forbidden.
7. **Tests (new):**
   - `src/test/orgKpiInactiveKraSet.test.ts` — inactive-only `kra_set` id ⇒ tile `propagated` for organization / department / employee scopes; mapped-set intersection.
   - Pending-chip arithmetic test: a `stuck` KPI is counted under Stuck, not Pending.
   - A snapshot-contract SQL assertion added to `docs/rls-audit.sql`-style checks: `kra_set_emp_ids ⊆ mappedEmpIds` for a sampled period.
8. **Hygiene visibility:** a read-only diagnostic query in the ADR listing definitions whose only remaining `kra_set` rows belong to inactive employees, so operations can decide whether to close or archive them (no bulk write in this change).

## Risk & impact
- **Data:** none. No schema change, no row writes; the RPC is `STABLE SECURITY DEFINER` and only its projection changes.
- **Workflow:** KPIs currently mis-shown as Pending/Stuck move to Propagated/Entered — that is the correction. Inactive employees stop being propagation targets; their child rows are left untouched.
- **UI/UX:** chip counts shift (Pending down, Stuck down); card layout unchanged.
- **Regression risk:** medium-low, concentrated in the tile/chip helper shared by the Propagate dialog — mitigated by the existing 4 parity suites plus the new tests.
- **Scalability:** the `active_base` CTE removes repeated per-aggregate scans; no added cost.
- **Rollback:** re-deploy the previous function body (kept verbatim in the ADR) and revert the two client files.

## Deliverables
- Migration: `get_org_kpi_data_entry_snapshot` + propagation-family inactive skip.
- `src/lib/orgKpiStatus.ts`, `src/pages/admin/OrgKpiDataEntry.tsx`, `src/hooks/usePropagateOrgKpiValue.ts`.
- `docs/adr/ADR-349.md`, `POLICY.md` §ORG-KPI-ACTIVE-POPULATION, `DOCUMENTATION.md` version entry, `roadmap.md`.
- New + existing Org KPI test suites green, build clean.

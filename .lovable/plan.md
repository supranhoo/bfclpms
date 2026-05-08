
## Problem

For the "On-Time Completion of HR Interventions" KPI (April 2026, scope=`employee`), after the user enters values for Avinash (20) and Debadutta (0) and clicks **Propagate**:

- Propagation succeeds — `review_submissions.achieved_value` is updated and `kpis.status` advances to `self_review` (verified in DB).
- The entry table re-renders showing **"—" everywhere** and the header drops back to "0 / 2 entered".
- The **Impact** sheet still shows the correct propagated values (it reads from `review_submissions` / `kpis`).

This is the inconsistency in the screenshots. It looks to the data‑entry user as if the data has vanished, even though it actually went through.

## Root cause

`OrgKpiDataEntry.tsx` builds the entry table's `scopedRows` (lines ~511–540) **only** from `existingValuesMap`, which is `org_kpi_values` keyed on `(category_id, kra_name, kpi_name, period, year, dept_id, emp_id)`.

For this KPI in April 2026, only a legacy **org‑scope** OKV row exists (`employee_id = NULL`, `status = 'pending'`, `achieved_value = NULL`). No per‑employee OKV rows exist for April. So:

- `existingValuesMap.get('…||null||<empId>')` → `undefined`
- Each scoped row is rendered with `achievedValue = null` → "—" in the cell
- The entered count drops to `0 / 2`

The Impact sheet reads from `review_submissions`, where propagation actually wrote `20` and `0`, so it stays correct. Two surfaces, two truths — exactly the kind of drift ADR‑055 / ADR‑056 were written to prevent for the tile chip.

## Fix (UI / read‑model only — no schema changes)

Make the entry table mirror the same source of truth as Impact when the OKV row is missing after propagation.

### 1. Add a per‑KPI `review_submissions` snapshot to the page

In `src/pages/admin/OrgKpiDataEntry.tsx`:

- For the currently visible employee‑scoped Org KPIs, fetch a slim `(kpi_id → { achieved_value, is_na })` map from `review_submissions`, keyed via `employeeKpiIdsMap` already exposed by `useOrgLevelKpisWithEmployees`.
- Cache via React Query, scoped to `(selectedPeriod, selectedYear, visible kpi ids)`. No new policies; reuses existing read access.

### 2. Fallback hydration in `scopedRows`

In the `scope === 'employee'` branch (and the equivalent `department` branch), when building each scoped row:

```text
achievedValue =
   org_kpi_values.achieved_value
   ?? review_submissions.achieved_value   // NEW fallback
   ?? null
isNa =
   org_kpi_values.is_na
   ?? review_submissions.is_na
   ?? false
```

This makes the row show the propagated value even when its per‑employee OKV row was never written (legacy data) or is briefly stale.

### 3. Status reconciliation for the header chip

Reuse `deriveOrgKpiTileStatus` (ADR‑056) — it already cross‑checks `kpis.status` and will report `propagated` correctly for this KPI. Just ensure the row counter ("X / Y entered") considers the fallback value above so it shows `2 / 2` instead of `0 / 2` after propagation.

### 4. Backfill safety net (optional, behind existing Data Repair)

Add a small repair action under `Data Repair` that, for any employee‑scope KPI where `kpis.status` is past `kra_set` but no per‑employee `org_kpi_values` row exists, inserts one with `status = 'propagated'` copying `achieved_value` from `review_submissions`. This is purely cleanup for legacy rows; the UI fix above does not depend on it.

### 5. Tests

- `src/test/orgKpiPostPropagationHydration.test.ts`
   - OKV row missing + RS has value → row shows the RS value, counter increments.
   - OKV row present with value → OKV wins (no regression).
   - OKV row present with `null` + RS has value → RS fallback used.
   - `is_na` from RS surfaces correctly.

## Risk & impact

- **Data**: read‑only change in the page; no schema, RLS, or storage changes. Optional repair is opt‑in.
- **Workflow**: none — propagation logic untouched. Only the entry table's read model changes.
- **UI/UX**: removes the "values vanished" surprise; entry table and Impact agree.
- **Regression**: low. Fallback only fires when OKV is missing/null; OKV remains the primary source.
- **Mitigation**: covered by the new tests plus the existing `orgKpiTileStatus` / `orgKpiStatusShared` guards.

## Out of scope

- Changing `propagate_org_kpi_value` to also upsert per‑employee `org_kpi_values` rows. That is a deeper change and is what the optional Data Repair action would clean up retroactively; we can take it as a follow‑up ADR if desired.

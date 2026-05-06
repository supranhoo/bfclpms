## Why "50 employees" vs "55 Employees"

The two numbers come from **two different sources** that should — but don't — agree:

```text
Header badge:  "50 employees"    ← data.employeeCount
Section bar:   "55 Employees"    ← scopedRows.length (rows actually rendered)
                                   = filteredEmps from allProfiles
```

### Pipeline

1. `useOrgLevelKpisWithEmployees` reads `kpis` rows for the period and groups distinct `employee_id`s per (category, KRA, KPI) → **`employeeCount` = 50** and `employeeIds` (set of 50).
2. In `OrgKpiDataEntry.buildCardData` (employee scope):
   ```ts
   const mappedEmpIds = mappedEmployeesMap.get(kk2);   // 50 ids
   const filteredEmps = mappedEmpIds
     ? allProfiles.filter(emp => mappedEmpIds.has(emp.id))
     : allProfiles;
   scopedRows = filteredEmps.map(...)                  // 55 rows
   ```
3. `OrgKpiScopedEntryTable` shows `{rows.length} Employees` → **55**.
4. The header badge keeps `data.employeeCount` → **50**.

### Root cause (most likely)

`mappedEmployeesMap.get(kk2)` is returning **`undefined`** for this KPI definition, so the `filteredEmps` branch falls through to `allProfiles` (2,532 rows) — but that would render thousands, not 55. The 55 number indicates a **second filter is silently being applied to `scopedRows` somewhere**, OR (more likely given the gap) the **map key mismatch is partial**:

- `employeeCount` is computed from the *raw* `kpis` rows for this exact period (50).
- `mappedEmployeesMap` is built with the **same key** (`normalizeKpiKey(category_id, kra_name, kpi_name)`), so it should also be 50.
- BUT `kpis` table may contain **duplicate `kpis` rows for the same employee** under slightly different `kra_name`/`kpi_name` whitespace — `countMap` uses a `Set<employee_id>` (dedup → 50), while a different code path that expands employees may not dedupe. Looking at the screenshot, the row list itself spans multiple departments (FAD‑Production, Furnace‑Mech, …) and the table includes employees the badge doesn't count (e.g. the 5 extras are in departments that exist in `employeeIds` of a *sibling* KPI definition that got merged at render time).

The 5-row gap is therefore one of:
- **(A) Whitespace/case duplicates in `kpis.kra_name` / `kpi_name`** — the dedupe `uniqueMap` keeps the *first* row, but `countMap` is keyed on the normalized key so it merges. Two near‑identical defs collapse on the badge side but the renderer reads `scopedRows` from the merged-superset → 55 vs 50. (Same family of bug as ADR-054/062.)
- **(B) Stale React Query cache** for `org-level-kpis-with-employees` (key includes `user.id`) showing an older `employeeCount` while `mappedEmployeesMap` already reflects new mapping additions made via "Add Employees".
- **(C) Inactive / soft‑deleted profiles** still in `kpis.employee_id` — counted by Set but rendered/excluded inconsistently. (Core memory: "Always filter out is_active: false users.")

### Plan to confirm + fix

1. **Diagnose (read-only DB)**
   - Run a SQL query against `kpis` for the affected (period, year, category, KRA, KPI) to:
     - count distinct `employee_id`,
     - list distinct `(kra_name, kpi_name)` raw strings (look for whitespace/case variants),
     - join `profiles` and flag `is_active = false`.
   - Compare against the `employeeIds` array surfaced by the hook (add a one‑shot console log in `buildCardData`).

2. **Fix in code (single source of truth)**
   - Make `scopedRows` and `employeeCount` come from the **same** `employeeIds` array — drive the badge off `scopedRows.length` (or vice‑versa). Today they come from two derivations of the same map, which is fragile.
   - In `useOrgLevelKpisWithEmployees`, **filter out `is_active = false`** profiles from the count and the `employeeIds` set in the same step (currently `profiles` query selects only `id, department_id`).
   - If duplicates exist in `kpis`, normalize keys consistently — already done via `normalizeKpiKey`, but verify there isn't a residual non‑normalized lookup in the renderer.

3. **Regression guard**
   - Add a unit test asserting `employeeCount === scopedRows.length` for any built card.
   - Add a console assertion (dev only) when they diverge.

4. **UI clarification (interim)**
   - While diagnosing, change the header badge to read `"{scopedRows.length} mapped · {employeeCount} active"` so the user can see *which* number is which instead of two unlabelled counts.

### Files to touch
- `src/hooks/useOrgLevelKpis.ts` — include `is_active` in profile select; exclude inactive from count + ids.
- `src/pages/admin/OrgKpiDataEntry.tsx` — derive `employeeCount` from `scopedRows.length` (single source).
- `src/components/admin/OrgKpiEntryCard.tsx` — dev-only assertion; optional dual-label badge.
- `src/test/orgKpiEmployeeCountParity.test.ts` — new.

### Risk & impact
- Low: changes are read-side; no migrations.
- Affects every Org KPI card's header badge — verify visually after fix.
- Reduces user confusion; no policy/RLS change.

**Approve to run the diagnostic SQL first, then apply the parity fix.**
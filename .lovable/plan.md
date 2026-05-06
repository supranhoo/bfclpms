# Fix: Impact Analysis shows 50, card shows 55

## Root Cause

The Org KPI card badge ("55 Employees") and the Impact Analysis sheet ("Total Affected: 50") are computed from **two different queries**:

| Source | Where | Filter applied | Result |
|---|---|---|---|
| Card badge | `OrgKpiDataEntry` → `scopedRows.length` (built from `mappedEmployeesMap` ∩ `useProfiles()` which forces `is_active = true`) | active employees only, deduped | **55** |
| Impact sheet | `useOrgKpiImpact` → fresh `kpis` query joined to `profiles!kpis_employee_id_fkey` | **no `is_active` filter**, drops rows where the embedded profile is null (RLS-hidden), no dedup against the card's mapping | **50** |

The 5-employee gap is caused by `useOrgKpiImpact`:
1. Not filtering `profiles.is_active = true`, so inactive employees can sneak in or be dropped depending on join.
2. Silently skipping `kpis` rows when the embedded profile join returns null (`if (!profile) continue;`) — RLS or a missing department FK can hide them.
3. Not using the canonical `mappedEmpIdsByKey` already computed by `useOrgLevelKpisWithEmployees` (the same source the card uses).

This violates ADR-064 (single source of truth for the Org KPI employee count).

## Plan

### 1. Pass the canonical employee id list to the Impact sheet
In `OrgKpiDataEntry.tsx`, when opening `OrgKpiImpactSheet`, pass the already-computed scoped employee id list for that KPI (from `mappedEmployeesMap` / `scopedRows`) as a new prop, e.g. `expectedEmployeeIds: string[]`.

### 2. Make the Impact hook honor that list
Update `useOrgKpiImpact` to:
- Accept an optional `expectedEmployeeIds` argument.
- Add `.eq('profiles.is_active', true)` to the embedded join (or filter post-fetch on `profile.is_active !== false`).
- After fetching, **intersect** the returned KPI rows with `expectedEmployeeIds` when provided so the sheet can never under- or over-report compared to the card.
- Keep the "skip if no profile" guard but log a dev-only warning when the count diverges from `expectedEmployeeIds.length`, so future drifts are caught.

### 3. Anchor the sheet's display counts
In `OrgKpiImpactSheet.tsx`, derive `Total Affected` and the `Affected Employees (N)` heading from `expectedEmployeeIds.length` when provided, falling back to `impact.totalEmployees` only for legacy callers. The table still renders whatever `impact.employees` returns; if they differ, show a small inline note ("X hidden by access policy") instead of silently disagreeing.

### 4. Regression test
Add `src/test/orgKpiImpactCountParity.test.ts` covering:
- Active-only filtering removes inactive employees from the count.
- When `expectedEmployeeIds` is passed, `Total Affected` equals its length even if a profile join returned null.
- Falls back gracefully when `expectedEmployeeIds` is omitted.

### 5. Docs / ADR
Extend ADR-064 with a short addendum: "The Impact Analysis sheet must reuse the same `mappedEmpIdsByKey` snapshot as the card; never re-derive employee scope from a fresh `kpis` query."

## Files to touch
- `src/hooks/useOrgKpiImpact.ts` — accept `expectedEmployeeIds`, add `is_active` filter, intersect results.
- `src/components/admin/OrgKpiImpactSheet.tsx` — accept and forward the new prop, anchor counts to it.
- `src/pages/admin/OrgKpiDataEntry.tsx` — pass the scoped employee id list when opening the sheet.
- `src/test/orgKpiImpactCountParity.test.ts` — new regression test.
- `docs/adr/ADR-064.md` — addendum.

## Risk & Impact
- **Data impact:** none — read-only fix.
- **Workflow impact:** none — only the count and labels in the Impact sheet change.
- **UI/UX:** the sheet will now show **55 / 55** matching the card; if RLS truly hides a profile, the inline note explains the divergence instead of showing the wrong number.
- **Regression risk:** low — change is scoped to one hook + one sheet; covered by new parity test.

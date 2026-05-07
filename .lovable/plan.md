## Problem (RCA)

Vivek's screenshot shows the Per-Employee KPI card "Adherence to Electrical Maintenance Budget" with the **"1 employee"** badge and the **N/A toggle**, but the **scoped entry table is missing** — there is no `1 Employees (0/1 entered)` expand button, so there is literally no place to type a value. The card jumps straight from the N/A toggle to the footer (History / Impact / Edit Scope / Data Owners / Remove / Propagate).

Why this regressed after the snapshot refactor:

1. The new snapshot RPC (`get_org_kpi_data_entry_snapshot`) supplies `employeeCount`, `employeeIds`, `mappedEmpIdsByKey`, `perEmployeeTargetMap` — the header badge ("1 employee") therefore renders correctly.
2. The card's actual entry table is built in `OrgKpiDataEntry.tsx → buildCardData`, where for `scope === 'employee'` we set `scopeLabel` and `scopedRows` **only inside** `if (scope === 'employee' && allProfiles)` (line ~484), and we then filter `allProfiles.filter(emp => mappedEmpIds.has(emp.id))`.
3. Render-time gate at `OrgKpiEntryCard.tsx:551` is `data.scope !== 'organization' && data.scopeLabel && !isNa`. So the entire scoped editor disappears whenever:
   - `useProfiles()` (the paged 1000-row fetch in `useOrganization.ts`) is still loading, **or**
   - the mapped employee isn't in the returned `allProfiles` set (RLS / pagination / inactive flag drift between snapshot and `useProfiles`).
4. With the snapshot RPC now serving the page much faster than the paged profiles query, this race window is hit far more often than before — admins land on the page, see the badges, but `scopedRows` is `undefined` so the input area is gone. Same for `scope === 'department'` if `useDepartments()` lags.

This is a **read-path regression** introduced by the snapshot work. Data is intact; only the input UI is hidden.

## Fix Plan (frontend only)

**Goal:** the scoped entry table for Per-Employee / Per-Department KPIs must always render whenever the snapshot says `employeeCount > 0`, independent of the paged `useProfiles` / `useDepartments` queries.

### 1. `src/pages/admin/OrgKpiDataEntry.tsx → buildCardData`
- Remove the hard `&& allProfiles` and `&& departments` gates inside the `scope === 'employee'` and `scope === 'department'` branches.
- Always set `scopeLabel = 'Employee' | 'Department'` based on `scope` alone.
- Build `scopedRows` **from the snapshot maps** (`mappedEmployeesMap` / `mappedDepartmentsMap` + `perEmployeeTargetMap`), not from `allProfiles`.
- Use `allProfiles` and `departments` **only to enrich** display fields (full name, designation, department name, dept grouping). When a profile is not yet in `allProfiles`, fall back to `scopeName = 'Employee {short id}'` and `departmentName = undefined` so the row still renders and can accept input.
- Keep the existing sort (department → name) but make the comparator tolerant of missing department names.
- Update the `useCallback` dependency array accordingly.

### 2. `src/components/admin/OrgKpiEntryCard.tsx`
- Loosen the render gate at line 551 so the table renders whenever `data.scope !== 'organization' && !isNa` and `data.scopedRows` is an array (even if empty), using the snapshot-derived `employeeCount` for the header count.
- Keep the existing amber "Showing X of Y mapped employees…" banner for the case where some profiles are still hidden by RLS — but it must no longer hide the editor itself.

### 3. `src/components/admin/OrgKpiScopedEntryTable.tsx`
- No structural change. Just confirm the trigger renders correctly when `rows.length === 0 && totalCount > 0` (it already does — `effectiveTotal` handles this and shows `"X Scope (0 / 0 visible entered)"`).

### 4. Regression tests (`src/test/`)
- New `orgKpiBuildCardData.test.ts` (or extend an existing test) covering:
  - Per-Employee KPI with `mappedEmpIds = [E1]` and `allProfiles = undefined` → `scopedRows.length === 1`, `scopeLabel === 'Employee'`, row uses `scopeId = E1` and a fallback display name.
  - Per-Employee KPI where `allProfiles` is loaded but the mapped employee is missing from it → still produces 1 scoped row (fallback name), not zero.
  - Per-Department KPI with `departments = undefined` → `scopedRows` built from `mappedDepartmentsMap`, `scopeLabel === 'Department'`.

### 5. Documentation / Memory sync (per project SSOT rule)
- Add **ADR-061**: "Scoped Org KPI editor must render from snapshot maps, not from `useProfiles`/`useDepartments`."
- Update `mem/features/admin/org-kpi-data-entry-snapshot.md` with a new rule:
  > The scoped entry table renders from `mappedEmployeesMap` / `mappedDepartmentsMap` + `perEmployeeTargetMap`. `useProfiles` / `useDepartments` are display enrichments only and must NOT gate the editor.
- Append a Version History entry in `DOCUMENTATION.md` and a §99 sub-rule in `POLICY.md` mirroring the same constraint.

## Risk & Impact

- **Data Impact:** none — read path only. No schema, no RLS, no historical rows touched.
- **Workflow Impact:** restores the original data-entry workflow for Per-Employee / Per-Department Org KPIs.
- **UI/UX:** scoped table now appears immediately on page load instead of after `useProfiles` finishes paging. Fallback display names (`"Employee {id-prefix}"`) only appear in the rare RLS-hides-profile case; the existing amber banner already explains it.
- **Regression Risk:** low. The Save/Propagate handlers already key off `scopeId` (employee/department UUID), not display name — the snapshot IDs are the same UUIDs. New unit tests guard against re-introduction.
- **Mitigation:** new tests + ADR-061 + memory entry to prevent future refactors from re-coupling the editor to `useProfiles`.

## Out of scope
- Snapshot RPC changes.
- Org-scope (`scope === 'organization'`) UI — already renders an input directly and was not affected.
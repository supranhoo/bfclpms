

## Plan — Whole-App Fix for Missing Employees in Picker/Search UIs

### Root Cause

PostgREST silently caps unranged queries at 1,000 rows. Several admin dialogs fetch `profiles` directly without `.range(...)` or the existing `fetchAllPaged` helper, so any employee beyond row ~1,000 (e.g. Vivek `101784` at row ~2,512 of 2,533 active) is invisible to client-side search/filter UIs that only look inside the loaded array.

`CopyKrasDialog` was already fixed in the prior turn. Several other admin pickers still have the same bug class.

### Strategy — Reuse Existing Pattern, Don't Invent New Infra

Active roster = **2,533 employees**. That's small enough that **Pattern A (full paged fetch via `fetchAllPaged`)** is the right tool for every picker we have. We do **not** need to build server-side async search — it would add complexity, debouncing, RPC surface, and cache churn for negligible gain at this scale. The existing `useProfiles()` hook in `src/hooks/useOrganization.ts` is already paged correctly and any picker reusing it is already safe.

**The rule going forward (single pattern, no ambiguity):**

> Any client-side `supabase.from('profiles').select(...)` that returns a list intended for selection, filtering, or display **must** use `fetchAllPaged(...)`. Single-row lookups (`.eq('id', x).maybeSingle()`) and `.in('id', [...])` lookups are exempt because they aren't capped by row scrolling.

### Audit Findings — Files to Fix

**Buggy (unpaged list fetch on `profiles`):**

1. **`src/components/admin/OrgKpiAddEmployeeDialog.tsx`** (line 50–54) — fetches active employees for Org KPI assignment picker without `.range()`. Same bug as Copy KRAs.
2. **`src/components/admin/CompetencyManagerTab.tsx`** (line 47–53) — loads all active profiles into local state for search; no paging.
3. **`src/components/admin/ReportAccessTab.tsx`** (line 45–55) — loads profiles for the user-override search picker; no paging, no `is_active` filter.
4. **`src/components/admin/AccessProfilesManager.tsx`** → `AssignmentTab` (line 511–522) — loads active profiles for the assign-user picker; no paging.
5. **`src/components/admin/AccessProfilesManager.tsx`** → `distinct-levels` query (line 207–211) — fetches `level` column; capped at 1,000 so distinct values from later rows are silently dropped.
6. **`src/hooks/useEmployeeFilterOptions.ts`** → `distinct-designations` and `distinct-grades` queries — same silent-truncation bug for distinct-value extraction.

**Already correct (paged, no change):** `useProfiles()`, `useProfilesByWorkflowStage()`, `useCompanyFilter()`, `useEmployeeFilterOptions().managers`, `CopyKrasDialog`.

**Exempt (not list/scroll fetches):** `ProfileSettings.tsx`, `ProfileHero.tsx`, all `.in('id', [...])` admin-name lookups in `usePendingSelfReviews`, `useCompliancePenalty`, `IncentiveDataExport`, `useIncentiveProgramMappingCount` (filtered `.in()` lookups, intentional 1k boundary acceptable for those summary counts), `AdminDashboard` count queries, `ManagementDashboard` (separate optimization concern out of scope).

### Implementation

**1. Migrate the 6 buggy fetches to `fetchAllPaged`** — minimal patches, identical select shape, just add `.range(from, to)` inside the helper. Examples:

`OrgKpiAddEmployeeDialog.tsx`:
```ts
const data = await fetchAllPaged<EmployeeRow>((from, to) =>
  (supabase as any)
    .from('profiles')
    .select('id, full_name, employee_code, department_id, designation, departments(id, name)')
    .eq('is_active', true)
    .order('full_name')
    .range(from, to)
);
```

Same shape applied to the other 5 spots. For the two distinct-value queries (`distinct-designations`, `distinct-grades`, `distinct-levels`), wrap in `fetchAllPaged` then de-dupe — no further logic change.

**2. Harden `EmployeeCombobox` data contract** — add a JSDoc warning on the `employees` prop stating: "Caller MUST provide a fully-paged dataset (e.g. via `fetchAllPaged` or `useProfiles()`). Unpaged Supabase queries silently cap at 1000 rows and will hide employees from search." No runtime check (would be performance noise) — documentation only, since the fix is at the data layer.

**3. Add a lint-style safety doc** — append a section to `DOCUMENTATION.md` (v2.66.7.9) and a new `POLICY.md §94`:

> **Profiles Query Policy**: All client-side `supabase.from('profiles').select(...)` calls that produce a list (for rendering, filtering, search, or distinct-value extraction) MUST be wrapped in `fetchAllPaged()`. Single-row `.maybeSingle()` and `.in('id', [...])` filtered lookups are exempt. Violations cause silent data loss past 1,000 rows.

**4. Memory updates** — append the rule to two memory files:
- `mem://features/admin/copy-kras-org-kpi-integrity` — note the same rule applies app-wide.
- New `mem://architecture/profiles-query-policy` (Core-tier) — single short rule referenced from `mem://index.md` Core section so every future loop applies it without re-reading.

**5. Regression test** — add `src/components/admin/__tests__/employeePickerPaging.test.ts`:
- Mocks Supabase to return 1,200 profiles across two pages.
- Asserts `fetchAllPaged` returns all 1,200.
- Asserts a profile placed at index 1,150 (post-page-1) is reachable through `EmployeeCombobox`'s in-memory filter when given the full array.
- Asserts `EmployeeCombobox` correctly excludes IDs in `excludeIds` and toggles multi-select state.

If a Vitest/Jest config isn't present, add a single self-contained Vitest spec with mocked `supabase` import; otherwise extend the existing setup.

### Files Changed

| File | Change |
|---|---|
| `src/components/admin/OrgKpiAddEmployeeDialog.tsx` | Wrap profiles fetch in `fetchAllPaged` |
| `src/components/admin/CompetencyManagerTab.tsx` | Wrap profiles fetch in `fetchAllPaged` |
| `src/components/admin/ReportAccessTab.tsx` | Wrap profiles fetch in `fetchAllPaged`, add `is_active=true` |
| `src/components/admin/AccessProfilesManager.tsx` | Wrap both profiles fetches (`AssignmentTab` + `distinct-levels`) in `fetchAllPaged` |
| `src/hooks/useEmployeeFilterOptions.ts` | Wrap `distinct-designations` and `distinct-grades` in `fetchAllPaged` |
| `src/components/admin/EmployeeCombobox.tsx` | JSDoc on `employees` prop documenting the paging contract |
| `src/components/admin/__tests__/employeePickerPaging.test.ts` | New regression test |
| `DOCUMENTATION.md` | v2.66.7.9 entry + Profiles Query Policy section |
| `POLICY.md` | New §94 |
| `mem://architecture/profiles-query-policy` | New Core memory |
| `mem://index.md` | Add Core line + Memories reference |
| `mem://features/admin/copy-kras-org-kpi-integrity` | Append rule scope expansion |

### Risk & Impact Report

- **Data Impact**: None. Identical SELECT shape, just paged. Restores rows that were silently dropped — strictly additive.
- **Workflow Impact**: None. No business logic changes.
- **UI/UX**: Pickers now show all 2,533 active employees instead of the first ~1,000. No layout/interaction changes.
- **Performance**: Each affected picker now issues 3 paged requests (~2.5k rows) instead of 1 capped request (~1k rows). Payload size grows ~2.5×, still well under 1 MB; React Query cache deduplicates across components. Dialogs remain `enabled`-gated where applicable so the cost is paid only on open.
- **Regression Risk**: Very low. Single pattern, well-trodden helper, no schema or logic touched.
- **Mitigation**: Regression test covers the >1,000-row case; doc + memory pin the rule for future generations.

### Follow-up Recommendations (Out of Scope)

- Convert `ManagementDashboard` and `AdminDashboard` ad-hoc profile fetches to `useProfiles()` for cache reuse (orthogonal optimization).
- If active roster ever exceeds ~10k, revisit and introduce server-side search via a `search_profiles(q text, limit int)` RPC; today it's premature.


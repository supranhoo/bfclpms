## Diagnosis: Chandra Bhan Singh's data IS in the database

I verified directly against the database. **No data was lost** when his employee code changed. Here is the evidence:

| Check | Result |
|---|---|
| Profile exists | Yes — `id: 99cd81eb…`, code `101964`, `is_active = true` |
| KPIs linked | 170 KPIs across Sep 2025 → Jun 2026 |
| Orphaned KPIs (broken link) | 0 |
| Eligible login record | Present, code `101964` |
| Department / Company / Manager | All set correctly |

**Why?** All KPI, review, incentive and report data link to the employee by **`employee_id` (UUID)** — never by `employee_code`. Changing the code does not break any data relationship. `employee_code` is only used as a *display label* and for matching during external imports.

## Real Root Cause: Stale React Query cache

Several reports cache employee → company / hierarchy / filter-option maps for **5–10 minutes** (`staleTime`):

- `useCompanyFilter` → `employee-company-map` (10 min) — drives the Company filter dropdown
- `useProfilesWithHierarchy` → `profiles-hierarchy` — drives Division/BU/Dept/Manager/Employee cascading filters
- `useEmployeeFilterOptions` — drives Employee picker dropdowns
- `useMonthlyTrend` → `monthly-trend` (5 min) — the report you were just on

When an admin updates `profiles.employee_code` from the User Management screen, **these query caches are not invalidated**. The browser keeps showing the snapshot taken before the edit, so:
- The Employee picker still shows the *old* code label, or
- A search by the *new* code finds nothing, or
- A previously-loaded trend grid does not re-fetch.

A hard refresh (Ctrl+F5) or waiting out the staleTime makes him reappear — confirming it is a cache problem, not a data problem.

## Plan (when you approve, I will implement)

### 1. Immediate fix for you (no code needed)
Press **Ctrl+F5** (hard reload) in the report. He will appear with the new code.

### 2. Permanent fix — invalidate caches on profile edits

In the User Management edit-profile mutation success handler, invalidate every query whose key materially depends on profile fields (`employee_code`, `full_name`, `department_id`, `company_id`, `is_active`, `reporting_manager_id`):

```text
src/components/admin/  →  user edit dialog mutation onSuccess
   queryClient.invalidateQueries({ queryKey: ['employee-company-map'] })
   queryClient.invalidateQueries({ queryKey: ['profiles-hierarchy'] })
   queryClient.invalidateQueries({ queryKey: ['employee-filter-options'] })
   queryClient.invalidateQueries({ queryKey: ['monthly-trend'] })
   queryClient.invalidateQueries({ queryKey: ['kpi-employee-matrix'] })
   queryClient.invalidateQueries({ queryKey: ['admin-reports'] })
   queryClient.invalidateQueries({ queryKey: ['profiles'] })
```

I will locate the exact mutation file (likely `UserManagementTab` / `EditEmployeeDialog`) and add a single shared helper `invalidateProfileCaches(queryClient)` so every future profile-edit path uses one call.

### 3. Defensive safeguard — bump staleTime keys with a "profiles version"

Add a lightweight `useProfilesVersion()` hook that subscribes to a Postgres realtime channel on `profiles` updates and increments a counter. Append that counter to the query keys above so any external profile change anywhere (HR import, bulk update, etc.) triggers an automatic refetch — not just edits made through the UI.

### 4. Regression test
- `src/test/profileCacheInvalidation.test.ts` — assert that updating a profile triggers invalidation of the seven query keys listed above.

## Files to be edited
- `src/components/admin/UserManagementTab.tsx` (or the actual edit dialog — I will confirm during implementation)
- `src/lib/profileCacheKeys.ts` (new — central list + `invalidateProfileCaches` helper)
- `src/hooks/useProfilesVersion.ts` (new — realtime version counter)
- `src/hooks/useCompanyFilter.ts`, `useKpiFilters.ts`, `useEmployeeFilterOptions.ts`, `useMonthlyTrend.ts` (append version to keys)
- `src/test/profileCacheInvalidation.test.ts` (new)
- `DOCUMENTATION.md` + `POLICY.md` (record the cache-invalidation contract)
- `mem://architecture/profile-cache-invalidation` (new memory rule)

## Risk & Impact
- **Data**: zero — read-side caching only.
- **Workflow**: none — invisible to users except that updates appear instantly.
- **Regression risk**: very low; invalidation is additive. Realtime subscription is a single lightweight channel.
- **Mitigation**: regression test + the central helper prevents future report hooks from forgetting to invalidate.

Approve and I will implement. Meanwhile, **press Ctrl+F5 on the Monthly Trend report** and Chandra Bhan Singh will show up immediately under code 101964.

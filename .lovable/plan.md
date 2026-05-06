## Why-Why Root Cause Analysis — "Org KPI Data not visible without multiple refreshes" (Chandan Pandit)

### Confirmed facts (from DB + code inspection)
- Chandan Pandit (`5412bfa9-…`, role = **manager**, active) IS a designated `org_kpi_data_owners` row for ~50 Safety KPIs (category `3e6001d2-…`).
- RLS on `org_kpi_values` (SELECT = `true` for authenticated) and `kpis` (data owners can view assigned org-level KPIs) is correct — *if* `auth.uid()` is populated when the request fires.
- Current month (May 2026) has **886** org-level kpi rows and **311** org_kpi_values rows.

### Why #1 — Page sometimes renders blank until refresh
Because `useOrgLevelKpisWithEmployees`, `useOrgKpiValues`, and `useOrgKpiOwnershipMap` all fire on first mount **without waiting for the Supabase session to be restored**.

### Why #2 — Why does that produce empty data?
If the session hasn't rehydrated from `localStorage` yet, the PostgREST request goes out with **no Bearer token** (or with `auth.uid() = null`). RLS on `kpis` requires a real `auth.uid()` to evaluate the data-owner EXISTS clause → **0 rows returned**. React Query then caches that empty result for `staleTime` (5 min in some hooks).

### Why #3 — Why does refreshing fix it?
On a hard refresh, `supabase.auth.getSession()` resolves synchronously from localStorage before the queries fire (browser warm cache + faster JS), so `auth.uid()` is present and RLS returns rows.

### Why #4 — Why is no hook gated by auth-readiness?
Only `useIsAnyOrgKpiDataOwner` uses `enabled: !!user?.id`. The three heavy hooks on this page use only `enabled: !!reviewPeriod && !!reviewYear`, so they race the auth bootstrap. There is no shared `useAuthReady` gate.

### Why #5 — Why is the empty result "sticky"?
- React Query default behaviour caches the empty array.
- `useRealtimeKpiSync` debounces invalidations 1500 ms and only re-fires on table changes — not on auth state change.
- `AuthContext` does not invalidate KPI/org-kpi caches when the session finishes restoring → the empty cache persists until manual refresh.

### Secondary contributing factors
1. **PostgREST 1000-row cap**: the `kpis` query inside `useOrgLevelKpisWithEmployees` has no `.range()` pagination. May 2026 = 886 rows (close to limit); a future month above 1000 will silently truncate even when auth is fine.
2. **Stale duplicate query**: page also calls `useOrgLevelKpis` (unfiltered) and `useOrgKpiValues` for both current + previous period — quadruples the race surface.
3. **Console log shows React `forwardRef` warning on AllKpis** — unrelated, but confirms the AlertDialog ref pattern is wrong elsewhere; not the cause here.

---

## Fix Plan (3 layers)

### Layer A — Auth-readiness gate (root fix)
1. Add `isReady` flag to `AuthContext` set to `true` only after the first `supabase.auth.getSession()` resolves.
2. Create `useAuthReady()` helper exposing `{ user, isReady }`.
3. Update the three hooks used by `OrgKpiDataEntry`:
   - `useOrgLevelKpisWithEmployees` → `enabled: isReady && !!user && !!period && !!year`
   - `useOrgKpiValues` → same gate
   - `useOrgKpiOwnershipMap` (via `useOrgKpiDataOwners`) → same gate
4. In `AuthContext`, when the session transitions from "not-ready → ready" call `queryClient.invalidateQueries({ queryKey: ['org-level-kpis-with-employees'] })` plus the org-kpi keys to evict any stale empty cache from racy mounts.

### Layer B — Pagination safety
- Refactor the `kpis` fetch inside `useOrgLevelKpisWithEmployees` to use `fetchAllPaged` (helper already exists in `src/lib/fetchAll.ts`) so months > 1000 rows do not silently truncate.

### Layer C — Diagnostics & guardrails
- Add a one-time console warn if a query returns 0 rows while `isReady === false` (helps catch future regressions).
- Add unit test `src/test/orgKpiDataEntryAuthRace.test.tsx` that mounts the page with a delayed session and asserts queries do NOT fire until `isReady`.
- Update `mem://architecture/profile-cache-invalidation` and POLICY.md with the new "Auth-Readiness Query Gate" rule.

---

## Files to edit / create
- `src/contexts/AuthContext.tsx` — expose `isReady`, invalidate on ready.
- `src/hooks/useAuthReady.ts` *(new tiny re-export for ergonomics)*.
- `src/hooks/useOrgLevelKpis.ts` — gate + paginate.
- `src/hooks/useOrgKpiValues.ts` — gate.
- `src/hooks/useOrgKpiDataOwner.ts` — gate `useOrgKpiDataOwners`.
- `src/test/orgKpiDataEntryAuthRace.test.tsx` *(new)*.
- `DOCUMENTATION.md`, `POLICY.md`, `CHANGELOG_2026.md`, new `docs/adr/ADR-052.md`.
- `mem/architecture/auth-readiness-query-gate` *(new memory)*.

## Risk & Impact Report
- **Data Impact**: None — RLS unchanged, no schema changes.
- **Workflow Impact**: None — only affects when queries fire.
- **UI/UX**: Initial render may show spinner ~50–200 ms longer on cold load; eliminates the "blank screen" bug.
- **Regression Risk**: Low. The `enabled` gate only blocks the *first* race; subsequent renders are unaffected. The pagination change is additive and backed by an existing helper used elsewhere.
- **Mitigation**: New unit test + manual QA logging in as Chandan after deploy.

Approve to implement.

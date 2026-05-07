## RCA
- April 2026 has Org KPI data in the backend: 862 org-level KPI rows, 170 unique definitions, 131 employees.
- Vivek Kumar Dansena (101784) is active and has the `admin` role.
- The screenshot shows the generic empty-state card even though data exists, which means the rows are being removed on the frontend by readiness/filter state rather than missing from the database.
- Likely failure points in `OrgKpiDataEntry.tsx`:
  1. The page only waits for `kpisLoading`, not auth/role/ownership loading, so it can compute `isAdmin=false`/empty ownership during the first render and show an empty card.
  2. `selectedOwnerId`, category, search, or status filters can remain stale after refresh/period changes and reduce `groupedKpis` to zero while the message still says “No org-level KPIs found”.
  3. The page does not show diagnostic counts, so users cannot distinguish “no backend rows” from “hidden by filters/access still loading”.

## Risk & Impact
- **Data/RLS impact:** No schema or RLS changes. Backend already returns the data.
- **Workflow impact:** Only Org KPI Data Entry rendering/filter behavior changes.
- **UI/UX impact:** Empty state becomes accurate and actionable; no visual redesign.
- **Regression risk:** Low; keep all existing filters but add loading guards and stale-filter reset.
- **Mitigation:** Add targeted tests for the empty-state/filter helper and update DOCUMENTATION.md + POLICY.md per SSOT rules.

## Implementation Plan
1. **Add readiness/loading guards**
   - In `useOrgKpiDataOwner.ts`, expose loading state from `useOrgKpiOwnershipMap()` by returning `isLoading` from `useOrgKpiDataOwners()`.
   - In `OrgKpiDataEntry.tsx`, include `loading`, `isReady`, `role`, and ownership loading before rendering the entry area.
   - Show `TableSkeleton` until auth role and ownership state are ready, avoiding the first-render false empty state.

2. **Reset stale filters when scope changes**
   - Add `useEffect` cleanup in `OrgKpiDataEntry.tsx`:
     - reset `selectedOwnerId` when that owner is no longer present in owner tiles,
     - reset `selectedCategoryId` when the selected category has no visible KPIs,
     - optionally reset `statusFilter` to `all` when selected status count is zero after period/year change.
   - Keep side effects in `useEffect` per project memory.

3. **Make empty states accurate**
   - Replace the single generic “No org-level KPIs found for the selected filters” message with specific cases:
     - backend truly has zero org KPIs for period/year,
     - admin access/role still loading,
     - rows exist but current filters hide all cards,
     - admin is viewing as natural role instead of Admin View.
   - Add a “Clear filters” button when filters hide all rows.

4. **Add lightweight diagnostics for admins**
   - On empty filtered results, display counts: backend definitions, after ownership, after frequency, after filters.
   - This will confirm in-app why Vivek sees zero without needing DB access.

5. **Regression tests**
   - Add a pure helper for empty-state classification (e.g. `deriveOrgKpiEmptyState`) and tests covering:
     - backend rows exist + loading ownership → skeleton/loading, not empty,
     - backend rows exist + stale owner/category/status filter → “filtered out” + clear filters,
     - backend zero rows → true “no org KPIs” message,
     - admin masked mode → admin-view prompt.

6. **Documentation and policy sync**
   - Update `DOCUMENTATION.md` Version History with the Vivek Org KPI visibility RCA and fix.
   - Update `POLICY.md` with a rule that Org KPI data-entry pages must not render generic empty states until auth/role/ownership data is ready and must distinguish filtered-zero from backend-zero.
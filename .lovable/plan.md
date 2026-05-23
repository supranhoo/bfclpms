## Assumptions
- The screenshot is Admin → All KRAs for user **Jaspal** in Admin View.
- The selected filter is **April 2026**, and the database does contain data for it.
- The desired outcome is: Admin should see the existing KRA/KPI rows immediately, not a zero/empty dashboard.

## Clarifications
Not Applicable.

## RCA Findings
- Database data exists: **April 2026 has 2,267 KPIs across 149 employees**; **May 2026 has 2,168 KPIs across 142 employees**.
- The UI shows zero because the page still uses the direct `useKpisByPeriod()` client query path from `kpis`.
- There is already a safer backend RPC pattern in the codebase (`get_reviewer_kpis_for_period`) that bypasses expensive per-row RLS overhead and returns period-scoped KPI rows.
- However, Admin → All KRAs does **not** use that RPC for the default month/year path, so it can still fail/return empty under the heavier direct query route.
- Secondary risk: `hydrateKpiRelations()` fetches related `profiles` using one large `.in(...)`; with >1,000 employee IDs this can also truncate/drop profile hydration. April currently has 149 employees, but the helper should still be hardened for scale.

## Risk & Impact Report
- **Data Impact:** No schema/data change required for the main fix. Existing KPI data remains untouched.
- **Workflow Impact:** No workflow/status logic changes. Admin visibility remains governed by existing backend role checks/RLS.
- **UI/UX Impact:** Empty state should change from misleading zero data to populated KPI stats/table. No visual redesign.
- **Regression Risk:** Low-medium. This touches the shared KPI fetch hook; mitigate with focused tests around the All KRAs period fetch path and relation hydration.
- **Scalability Impact:** Improves scalability by routing period reads through the existing backend RPC and paging results; hardens profile hydration for large employee counts.
- **Mitigation Plan:** Minimal hook-level change, keep existing return shape, add regression tests, update DOCUMENTATION.md and POLICY.md.

## Step-by-step Plan
1. **Update KPI period fetch path**
   - In `src/hooks/useKpis.ts`, change `useKpisByPeriod()` for month/year fetches to use the existing paged RPC `get_reviewer_kpis_for_period` instead of direct `kpis` reads.
   - Preserve support for `selectedPeriod === 'all'` using the existing direct year-scoped query path.

2. **Harden relation hydration**
   - Update `hydrateKpiRelations()` so profile/category lookups are chunked or paged safely instead of relying on one potentially large `.in(...)` response.
   - Keep the resulting `kpi.profiles` and `kpi.kra_categories` shape unchanged for the UI.

3. **Keep All KRAs UI unchanged except data correctness**
   - `src/pages/admin/AllKpis.tsx` should continue using `useKpisByPeriod()`.
   - No layout or filter behavior changes unless a small loading/error state adjustment is needed to avoid showing zero before the query completes.

4. **Add regression tests**
   - Add/extend tests verifying Admin All KRAs uses the RPC-backed period fetch route.
   - Add/extend tests verifying relation hydration does not drop rows when employee/profile lookup exceeds normal response limits.

5. **Documentation and policy sync**
   - Update `DOCUMENTATION.md` Version History with the All KRAs visibility fix.
   - Update `POLICY.md` to state Admin All KRAs period reads must use paged RPC/large-read-safe hydration rather than direct full-period client scans.

## UI Changes
- **Location:** Administration → All KRAs.
- **Visual change:** No redesign. Existing KPI cards/table should populate for April/May 2026 instead of showing `0` and “No employees found”.
- **Interaction impact:** Existing filters remain the same.
- **Responsiveness:** Not affected.

## Implementation
Pending approval.

## Tests
- Add focused regression test(s) for the hook behavior and large relation hydration.
- Do not run full build manually; run targeted tests only if needed after implementation.

## DOCUMENTATION.md updates
- Add version-history entry: Admin All KRAs period fetch now uses paged backend retrieval so existing KPIs are not shown as empty.

## POLICY.md updates
- Add/adjust policy note: large All KRAs period reads must use paged backend/RPC access and safe relation hydration.

## Post-implementation notes
- Rollback: revert `src/hooks/useKpis.ts`, tests, and doc/policy entries.
- No database migration expected.
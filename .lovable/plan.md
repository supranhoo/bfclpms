## Why-Why analysis result

**Confirmed facts for Sajid Raza (100264):**
- Sajid is active, role = `manager`, department = `DRI`.
- His visibility is based on `profiles.reporting_manager_id`, **not department**.
- He has **13 direct** + **172 indirect** active mapped employees = **185 mapped employees**.
- For May 2026, mapped reports already have **247 KPI rows across 12 employees**; including Sajid’s own KPIs, there are **278 rows across 13 employees**.
- Those May rows are currently **not issued** (`is_issued = false`), but the dashboard should still not collapse to zero if the policy is to show mapped roster + KPI state.

**Root cause, verified instead of assumed:**
1. The dashboard calls `get_reviewer_kpis_for_period('May', 2026)` for non-full-access managers.
2. That backend function fails only in the non-full-access branch with:
   `column reference "id" is ambiguous`.
3. Because the KPI RPC fails, `periodKpis` is unavailable; stats fall back to zero and the diagnostic incorrectly says “No KPIs assigned”.
4. Admin/HR/Management users do not hit this failing branch, which explains why the Admin-style view can show data while Sajid’s manager view shows 0.
5. A secondary issue exists on the current URL: `?mgr=b68f5bce...` is a hidden manager filter for non-full-access manager views. Even after the RPC fix, this can wrongly narrow Sajid’s team view to only direct reports instead of all direct + indirect mapped employees.

**Who else is affected:**
- This is not isolated to Sajid.
- Any non-full-access reviewer/manager using the manager branch of these functions can be affected.
- Current database audit shows **105 non-full reviewer users** with mapped teams, covering **2,473 direct** and **2,226 indirect** report relationships.
- Largest affected examples include Sindhu Raj Singh, Saibal Kunar, V.A.V.S.S. Ganapathi Varma, Sujeet Kumar Singh, Abhishek Prasad, Sajid Raza, Jitendra Kumar Dwivedi, Chandra Bhan Singh, Y R V S Murthy, and Pratap Chatterjee.

## Risk & Impact Report

**Data impact:** No historical KPI/profile data will be changed. The fix is to correct read-only backend helper functions and frontend filter handling.

**Workflow impact:** Restores intended manager visibility: direct + one-level indirect mapped employees, with self-review remaining separate.

**UI/UX impact:** The dashboard will stop showing a misleading “No KPIs assigned” banner when the real issue is a data-load/RPC failure. Hidden manager URL filters will no longer affect normal manager views.

**Regression risk:** Medium, because the same helper functions are shared by Team Reviews, stage-filtered reviewer rosters, and reporting dashboards.

**Mitigation:** Add regression tests for the diagnostic branch and hidden-manager-filter behavior, and update POLICY/DOCUMENTATION in the same change.

## Implementation plan

1. **Fix backend helper functions**
   - Create a migration replacing `get_reviewer_kpis_for_period` and `get_reviewer_roster_slim`.
   - Rename/qualify CTE columns in the non-full branch, e.g. `profile_id`, so output column `id` no longer conflicts with CTE `id`.
   - Preserve the existing security model: full-access users see all active data; non-full users see self/direct/indirect scope as currently intended.

2. **Fix hidden manager filter leakage**
   - In `EmployeeSelectorGrid`, apply `selectedManager` only for full-access users.
   - Auto-clear or ignore `mgr` URL params for non-full-access Team Reviews so Sajid sees all mapped direct + indirect employees, not a hidden filtered subset.

3. **Harden the zero-state diagnostic**
   - Add an explicit `rpc_error` / `data_load_error` branch to `TeamReviewsZeroDiagnostic`.
   - If KPI/profile loading fails, show “Dashboard data could not be loaded” with refresh guidance instead of “No KPIs assigned”.

4. **Close auth/cache race gap**
   - Extend the auth-ready query invalidation to include `kpis-by-period-ranges`, `profiles`, `profiles-by-workflow-stage`, `team-members`, and `skip-level-team-members` so manager dashboards refetch after the session is ready.

5. **Regression protection**
   - Add/update tests for:
     - diagnostic returns `rpc_error` when KPI loading fails;
     - non-full manager views ignore hidden `mgr` filters;
     - Sajid-style direct + indirect roster logic remains counted as one manager scope.

6. **Documentation and policy sync**
   - Update `POLICY.md` with the verified rule: Team Reviews visibility is reporting-chain based, not department based.
   - Update `DOCUMENTATION.md` version history with the Sajid RCA, affected-user class, and fixed helper-function contract.
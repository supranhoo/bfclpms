## Assumptions
- The screenshot error is from **Monthly Scorecard Report → Date Range (Trend)**.
- This is a **monthly KPI report** issue only; annual review logic must remain untouched.
- Root cause is confirmed: `public.get_monthly_trend` references `profiles.business_unit_id`, but the live `profiles` table does not have that column. Business unit must be derived via `profiles.department_id → departments.business_unit_id → business_units.id`.

## Clarifications
- Not Applicable — the failing column and affected module are clear.

## Risk & Impact Report
- **Data Impact:** No data changes. One backend function will be replaced in-place; no tables/columns/rows modified.
- **Workflow Impact:** Restores Date Range Trend loading for authorized report users. No change to monthly KPI scoring rules, KRA/KPI review stages, or annual review workflows.
- **UI/UX Impact:** No UI layout change. The existing error banner should disappear once the RPC succeeds.
- **Regression Risk:** Low, isolated to the Monthly Scorecard Date Range Trend RPC return shape.
- **Scalability Impact:** Preserves server-side aggregation; no return to client-side batch fetching.
- **Mitigation Plan:** Add a regression guard ensuring the monthly trend RPC derives BU through `departments.business_unit_id` and never references `profiles.business_unit_id`.
- **Rollback Strategy:** Revert the single corrective migration; no data rollback needed.

## Step-by-step Plan
1. Create a backend migration replacing `public.get_monthly_trend(...)`.
2. Change the employee metadata join from:
   - `p.business_unit_id`
   to:
   - `d.business_unit_id AS business_unit_id`
   - `LEFT JOIN business_units bu ON bu.id = d.business_unit_id`
3. Keep all existing contracts unchanged:
   - same parameters
   - same return columns
   - same admin / HR PMS / management access gate
   - same 8-stage score fallback
   - same active-user filtering
   - same execute grants
4. Add/update regression test coverage for the Monthly Trend contract so this schema mismatch cannot reappear.
5. Update `DOCUMENTATION.md` version history with the RCA/CAPA.
6. Update `POLICY.md` under the Monthly Trend server aggregation policy to state BU metadata must be resolved from department hierarchy, not `profiles.business_unit_id`.
7. Verify the fix by checking the RPC definition and, if possible, loading the same March–May 2026 trend path.

## UI Changes
- Not Applicable — no visual changes proposed.

## Implementation
- Pending approval. The implementation will be limited to the Monthly Scorecard Trend backend function, regression test, and documentation/policy updates.

## Tests
- Add a regression assertion that `get_monthly_trend` does not reference `p.business_unit_id` / `profiles.business_unit_id`.
- Assert it uses `d.business_unit_id` and joins `business_units` from the department-derived BU.

## DOCUMENTATION.md updates
- Add a new version entry noting the Date Range Trend failure: `column p.business_unit_id does not exist`.
- Document the fix as a schema-aligned RPC correction with zero data impact.

## POLICY.md updates
- Amend the Monthly Trend server aggregation policy: organization metadata must follow the current hierarchy (`profiles.department_id → departments.business_unit_id`) and must not assume a denormalized BU column on `profiles`.

## Post-implementation notes
- This fix is only for the **KRA KPI Monthly Review / Monthly Scorecard Trend** report.
- It does **not** modify Annual Review forms, annual reviewer chains, annual review scoring, or annual review RLS.
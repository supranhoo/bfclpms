## 1. Assumptions
- The screenshot is for **Incentive Report → May 2026 → Metal Sizing → Saibal Kunar → Period 11-20**.
- The incorrect value is the **Total Amount ₹1,48,842** and some row amounts.
- Saibal Kunar production rate should resolve from `profiles.company_id` first, then fall back to org chain only if direct company is missing.

## 2. Clarifications
Not Applicable — the attached screenshot and database values are enough to identify the defect.

## 3. Root Cause Analysis
- Current records show **37 Saibal Kunar rows**, **300 tons**, total displayed as **₹1,48,842**.
- Expected using Saibal Kunar rate **₹503.39 × 300 tons = ₹1,51,017**.
- **21 rows are using ₹490.62** instead of **₹503.39**.
- Cause: `compute-monthly-incentives` tries to build employee company lookup from a global `profiles.select('id, company_id')` without pagination. The backend API caps this at 1000 rows, so employees beyond that cap lose `profiles.company_id` and incorrectly fall back through department → BU → division company, resolving the Bihar Foundry rate instead of Saibal Kunar.

## 4. Risk & Impact Report
- **Data Impact:** Existing incorrect incentive rows for affected periods/programs need recomputation after code deployment. No schema/data destructive migration is needed.
- **Workflow Impact:** Compute flow remains same; it will produce corrected values when **Compute** is clicked again.
- **UI/UX Impact:** No visual redesign. Amounts and totals will change after recompute.
- **Regression Risk:** Low if we keep the existing rate cascade and only fix company lookup source.
- **Scalability Impact:** Improves scalability by avoiding an unpaginated full-profile lookup. Company lookup becomes per-employee in the current compute scope.
- **Mitigation Plan:** Add a regression test locking the edge-function contract so direct `company_id` is loaded with employees and no global capped company lookup is used.
- **Rollback Strategy:** Revert the edge-function source change and redeploy if unexpected side effects appear; no database rollback required.

## 5. Step-by-step Plan
1. Update `compute-monthly-incentives` employee select to include `company_id` directly in `empSelect`.
2. Replace rate/slab company resolution to read `emp.company_id` directly instead of relying on the capped `empToCompanyDirect` map.
3. Remove the unpaginated `profiles.select('id, company_id')` lookup from the function.
4. Add a regression test confirming:
   - `empSelect` includes `company_id`.
   - the function no longer performs a global unpaginated `profiles.company_id` lookup.
   - production amount for the BFCL/Saibal scenario resolves to **₹503.39** rather than the fallback **₹490.62**.
5. Update `DOCUMENTATION.md` with this RCA and fix.
6. Update `POLICY.md` to state production incentive compute must use direct scoped employee `company_id` and must not use unpaginated global profile maps.
7. Deploy the updated backend function and validate by recomputing or dry-running May 2026 / Metal Sizing / Saibal Kunar / 11-20.

## 6. UI Changes
- **Visual changes:** None.
- **Location:** Incentive Report table and summary cards will show corrected amounts after recompute.
- **Interaction impact:** Existing Compute button flow unchanged.
- **Responsiveness:** Not Applicable.

## 7. Implementation
- Backend-only calculation fix in `supabase/functions/compute-monthly-incentives/index.ts`.
- Test-only support in `src/test/...`.
- Documentation and policy updates.

## 8. Tests
- Add/extend unit/contract coverage for production rate company resolution and unpaginated lookup prevention.
- Validate the real May 2026 Metal Sizing Saibal Kunar sample after deployment.

## 9. DOCUMENTATION.md updates
- Add a new version entry documenting the 1000-row cap RCA and corrected total expectation.

## 10. POLICY.md updates
- Add/extend production incentive policy: direct profile company must be available in the compute employee scope; unpaginated global profile maps are forbidden for rate resolution.

## 11. Post-implementation notes
- After the fix is deployed, click **Compute** again for **May 2026 → Metal Sizing → Saibal Kunar → 11-20**. The total should move from **₹1,48,842** to approximately **₹1,51,017**.
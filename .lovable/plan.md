## 1. Assumptions
- Sandeep 200291 is using `/admin/incentive-data-entry` with Metal Sizing and Bihar Foundry & Casting Limited selected.
- The screenshot message is incorrect: database verification shows Metal Sizing already has 292 mappings and 3 company production rates.
- This is a permissions/query-shape issue, not missing business data.

## 2. Clarifications
Not Applicable.

## 3. Risk & Impact Report
- **Data Impact:** No data/schema changes expected. Existing production rates and employee mappings remain unchanged.
- **Workflow Impact:** Incentive Data Entry users should regain read access to the production grid without restoring broad profile access.
- **UI/UX Impact:** Same screen and controls; the incorrect “No production rates configured” state should be replaced by the employee grid when rates resolve.
- **Regression Risk:** Low-to-medium because `useProductionRates()` is shared with the Production Rates config tab.
- **Scalability Impact:** Keep the data-entry path lightweight by fetching only production-rate columns, not embedded profile data.
- **Mitigation Plan:** Split rate fetching from employee-profile display needs and add tests for the data-entry no-profile-join invariant.

## 4. Step-by-step Plan
1. Update the production-rate read path so Incentive Data Entry fetches only `incentive_production_rates` columns required for rate resolution.
2. Adjust `ProductionRatesTab` so employee-rate display still works after `useProductionRates()` no longer embeds `profiles`.
   - Use existing profile lookup patterns only in the admin/config tab where names are needed.
   - Do not reintroduce broad profile SELECT policies.
3. Improve failure handling in `ProductionDailyGrid` so a rate query error is not silently rendered as “No production rates configured.”
4. Add/extend unit tests to lock the regression:
   - rate rows can exist without embedded profile data;
   - the empty-state helper does not mislabel failed rate visibility as missing configuration.
5. Update `DOCUMENTATION.md` and `POLICY.md` to document that Incentive Data Entry must not depend on direct `profiles` joins for production-rate resolution.

## 5. UI Changes
- **Location:** Incentive Data Entry → Production Data → Metal Sizing grid.
- **Visual change:** The grid should show mapped employees once rates resolve; if a backend read fails, show an explicit load/error message instead of “No production rates configured.”
- **Interaction impact:** No new user actions.
- **Responsiveness:** No layout changes.

## 6. Implementation
After approval, I will make a surgical frontend-only fix in the shared production-rate hook and the production grid/config tab call sites. No backend migration is planned unless the implementation reveals a separate RLS error.

## 7. Tests
- Add/modify Vitest coverage for the production-rate visibility regression.
- Run the targeted test file(s) only.

## 8. DOCUMENTATION.md updates
Document the RCA: production-rate resolution must not require embedded profile reads because non-admin Incentive Data Entry users are intentionally restricted from broad profile access.

## 9. POLICY.md updates
Record the policy rule: production-entry screens may use non-PII roster RPCs and rate tables, but must not restore broad `profiles` access or select profile PII to render incentive rates.

## 10. Post-implementation notes
- Rollback is safe: revert the frontend hook/call-site changes.
- Other unrelated issues are not included in this plan.
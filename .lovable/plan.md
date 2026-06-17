## Assumptions
- The screenshot is for Sandeep Kumar (employee code 200291) on `/reports/incentive`.
- He should be able to view and compute Incentive Report data for the selected program/company/period because he has `reports-incentive` access.
- This is the same class of issue as Upendra’s case, but on the report records table rather than only profile names.

## Clarifications
Not Applicable.

## Risk & Impact Report
- **Data Impact:** Additive RLS policy only; no schema or historical data changes.
- **Workflow Impact:** Users with `reports-incentive` can read report records they are authorized to access and can use existing report compute flow. This aligns with the edge function already allowing `reports-incentive`.
- **UI/UX Impact:** The table should show existing computed records instead of `0`; empty-state text remains unchanged except it will be reached only when records truly do not exist.
- **Regression Risk:** Low-to-medium because incentive records contain payout data. Mitigation is a narrow read-only policy for the `reports-incentive` menu key, not a broad public/read policy.
- **Scalability Impact:** Existing report fetching is already paged for all-mode and table UI is paginated. No additional full-table client load will be introduced.
- **Rollback Strategy:** Drop the new RLS policy if access needs to be revoked.

## Step-by-step Plan
1. **Backend RCA fix**
   - Add a new RLS SELECT policy on `employee_incentive_records` allowing users with `has_menu_access_override(auth.uid(), 'reports-incentive')` to read incentive report rows.
   - Keep existing admin/HR/management/own-record policies untouched.

2. **Access consistency check**
   - Confirm `profiles` already has `reports-incentive` active-profile visibility from the previous migration.
   - Confirm `has_menu_access_override` already checks both direct overrides and access-profile grants.

3. **Regression test**
   - Add a focused test/static guard verifying incentive record report visibility includes the `reports-incentive` key, so future migrations do not regress to `admin-incentive` only.

4. **Documentation sync**
   - Update `POLICY.md` to state that `reports-incentive` grants read access to Incentive Report records and profile names, while writes/status changes remain governed separately.
   - Update `DOCUMENTATION.md` version history with RCA for Sandeep Kumar (200291).

## UI Changes
- **Visual change:** No layout/design changes.
- **Exact location:** Incentive Report table should populate rows for existing computed records.
- **Interaction impact:** Existing filters, Compute, Export, Confirm, and Mark Paid controls remain unchanged.
- **Responsiveness:** Not affected.

## Implementation
- Create one backend migration for the new read-only report policy.
- Add one regression test file or extend an existing incentive/RLS policy test.
- Update documentation and policy files in the same change.

## Tests
- Add a regression guard for `employee_incentive_records` RLS containing `reports-incentive` SELECT access.
- Verify Sandeep’s direct access state: `reports-incentive = true`, `admin-incentive = false`; after the policy, this should be sufficient for report rows.

## DOCUMENTATION.md updates
- Add a version-history entry documenting the issue, RCA, and additive RLS fix.

## POLICY.md updates
- Amend Incentive Report policy to define report record read visibility for `reports-incentive` users.

## Post-implementation notes
- No employee data will be modified.
- The screenshot shows existing June 2026 Metal Sizing records for period `1-10`; the current blocker is RLS visibility, not missing computation data.
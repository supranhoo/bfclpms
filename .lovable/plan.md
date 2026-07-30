## Assumptions
- The screenshot is from the Employee Import flow.
- The three failed rows are new employees: `101393`, `101395`, and `101818`.
- The import file likely contains a company other than `BFCL` or a company value resolving to a non-BFCL company for these rows.
- Existing policy intentionally validates `employeeCategory` against company-scoped master data; this is why the import now shows clear failures instead of a generic non-2xx error.

## Clarifications
Not required before implementation. The failure reason is specific enough to fix safely.

## Risk & Impact Report
- **Data Impact:** Add missing employee category master rows for the affected company scope(s), or convert selected categories to global only if policy supports it. No existing employee records will be changed.
- **Workflow Impact:** Employee import will stop rejecting valid categories for the selected company. No review/KPI workflow logic changes.
- **UI/UX Impact:** No visual redesign. The same import screen will work; error messages may be tightened if needed.
- **Regression Risk:** Low, if we add company-scoped master rows instead of bypassing validation. Risk is medium if categories are made global because that changes availability across all companies.
- **Scalability Impact:** No large-data impact. Master table has only a few rows; lookups remain bounded and indexed.
- **Mitigation Plan:** Keep the validation rule; only repair master data/config. Add regression tests for BFCL, Saibal, and missing category cases.

## Confirmed Current State
- Database currently has only BFCL-scoped employee category masters:
  - `Non ESI` exists only for BFCL.
  - `Retainership` exists only for BFCL.
  - No global category rows exist for these categories.
- The failing employees are not currently present in `profiles`, so this is a create-time import failure.
- The frontend importer and `create-employee` backend function both enforce: category must be either global or scoped to the selected company.

## 5-Why Analysis
1. **Why did the import fail?** The selected `employeeCategory` is not available for the row’s resolved company.
2. **Why is it not available?** The master table contains those categories only under BFCL.
3. **Why did the importer block it?** ADR-202 added strict company-scope validation to prevent invalid employee master data.
4. **Why did this surface now?** The system previously showed only a generic edge-function failure; now it correctly exposes the underlying master-data mismatch.
5. **Why is the business process blocked?** The master data setup does not cover the company/category combinations used in the import file.

## RCA
Root cause is not the import engine failing technically; it is a master-data configuration gap. `Non ESI` and `Retainership` are BFCL-scoped categories, but the failed import rows resolve to another company, so validation correctly rejects them.

## CAPA
### Corrective Action
- Add/repair employee category master rows for the company used by rows `101393`, `101395`, and `101818`:
  - `Non ESI`
  - `Retainership`
- Keep categories company-scoped unless the business confirms these categories should apply globally.

### Preventive Action
- Add a small admin/import pre-check enhancement: when a category exists for another company, show which company currently owns it and which company the import row resolved to.
- Add regression tests so company-scoped categories remain accepted only for matching companies and rejected with clear messaging for non-matching companies.
- Update documentation and policy to clarify that Admin → Master Data → Employee Categories must be maintained per company unless marked global.

## Step-by-step Plan
1. **Repair master data**
   - Query the exact company resolved for the failed rows from the import values if available; otherwise infer from the screenshot/error context and current company masters.
   - Add missing `employee_categories` rows for the affected company, not employee records.

2. **Tighten importer guidance**
   - Update the import preview error message to include:
     - row company value,
     - resolved company,
     - category’s existing company scope.

3. **Backend parity**
   - Keep the `create-employee` backend validation aligned with the frontend.
   - If needed, improve the backend error text in the same way, without weakening validation.

4. **Tests and mock data**
   - Extend `src/test/importCategoryCompanyScope.test.ts` with:
     - category available for same company succeeds,
     - same category unavailable for another company fails,
     - adding a company-specific row for the second company succeeds,
     - global category still succeeds for all companies.

5. **Documentation / Policy**
   - Update `DOCUMENTATION.md` version history.
   - Update `POLICY.md` under Employee Category & Employment Status with the company-scoped import rule and admin maintenance instruction.

6. **Validation**
   - Run the targeted import/category tests.
   - Re-check the category masters after the migration/data update.

## UI Changes
- No layout changes.
- Only import error wording may be improved in the existing Import Results/preview area.
- Responsiveness unchanged.

## Implementation
- Requires a small data repair and possibly a small frontend/backend message improvement.
- No destructive schema changes.

## Tests
- Add/extend unit tests for employee category company scoping.
- Run the targeted test file.

## DOCUMENTATION.md updates
- Add a version-history entry explaining that company-scoped category master gaps caused the failed imports and how the validation behaves.

## POLICY.md updates
- Clarify that employee category import validation is company-scoped and that admins must create category rows per company unless a category is intentionally global.

## Rollback Strategy
- If the added category master rows are wrong, deactivate/delete only those newly added master rows.
- Revert any wording/test/documentation changes if needed.
- No employee data rollback required because failed rows have not been created yet.

## Post-implementation notes
- After this repair, re-run the same import file. The three rows should pass category validation; any remaining failures would indicate a different column/master-data issue and should be handled separately.
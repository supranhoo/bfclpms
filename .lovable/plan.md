## 1. Assumptions
- Upendra is a non-admin Incentive Data Entry user, so direct profile/company lookups can be RLS-restricted.
- The reported blank Excel is from **Incentive Data Entry → Download Excel** after selecting a daily production program such as **Metal Sizing** and company **Bihar Foundry & Casting Limited**.
- The on-screen grid has the correct employees/data, but the Excel export is not using the same company-filter and rate-resolution source as the grid.

## 2. Clarifications
Not Applicable — the issue is narrow and reproducible from the current export path.

## 3. Risk & Impact Report
- **Data Impact:** No historical data will be changed. Likely one additive/replace RPC migration only if needed to expose non-sensitive `company_id/business_unit_id/division_id/pms_grade` fields for export parity.
- **Workflow Impact:** Export output will match the selected program/company grid instead of relying on the RLS-sensitive `filterByCompany` helper.
- **UI/UX Impact:** No visual UI change; the same **Download Excel** button remains.
- **Regression Risk:** Medium because Incentive exports have several prior fixes around RLS, pagination, and roster filtering. Mitigation is targeted tests around blank export, company filter, and company-rate handling.
- **Scalability Impact:** Keep paged reads for large tables and avoid unbounded direct profile reads. The mapped roster is resolved server-side via RPC, consistent with the grid.
- **Backup/Data Integrity:** No new public table; automatic backup coverage unchanged.
- **Rollback:** Revert the export code/test/doc/policy changes and, if added, drop/revert the RPC replacement migration.

## 4. Step-by-step Plan
1. **Root cause confirmation**
   - Confirm `IncentiveDataExport` daily export still filters via `filterByCompany` from `useCompanyFilter`.
   - Confirm `ProductionDailyGrid` already avoids this for selected company and instead filters by RPC-provided `company_id`.
   - Confirm Metal Sizing has company-level rates, while export currently only supports employee/common rates.

2. **Correct the daily Excel export roster**
   - Update the export resolver to use the same server-authoritative mapped roster source as `ProductionDailyGrid` (`get_incentive_program_employees`) or extend the existing directory RPC shape only with non-sensitive org-scope fields.
   - Pass `selectedCompanyId` into the export component and filter by the resolved employee `company_id`, not the RLS-sensitive `filterByCompany` map.
   - Preserve the zero-mapping invariant: if the program has no mappings, export must return `No data` rather than unrelated employees.

3. **Correct the daily Excel export rate resolution**
   - Replace the export-only `employee/common` rate lookup with the canonical `resolveEmployeeRate` cascade: employee → department → BU → company → common.
   - Include `effective_from` in export rate reads so date-aware rates match the grid.
   - This prevents company-rate programs like Metal Sizing from exporting rows with zero/blank rate amounts.

4. **Keep vessel/target behavior stable**
   - Leave target export unchanged.
   - For vessel export, keep current company filtering unless evidence shows the same RLS issue there; do not broaden scope unnecessarily.

5. **Regression tests and mock data**
   - Extend `src/test/incentiveExportData.test.ts` with helper-level coverage for:
     - selected-company filtering using RPC-provided `company_id` even when `filterByCompany` would reject everyone;
     - company-level rate resolution for Metal Sizing-style rates;
     - zero mappings still produce an empty roster.
   - Extend source-contract tests if RPC/direct-profile rules change.

6. **Documentation and policy sync**
   - Add a new `DOCUMENTATION.md` Version History entry with RCA / 5-Why / CAPA.
   - Update `POLICY.md` under Incentive Mapping/Exports to state: Data Entry exports must use RPC-resolved company scope and canonical rate resolver; `filterByCompany` alone is forbidden for selected-company daily exports.

## 5. UI Changes
Not Applicable — no visual layout or interaction changes. The existing button will produce the corrected workbook.

## 6. Implementation
After approval, I will make the smallest code changes in:
- `src/lib/incentiveExportData.ts`
- `src/components/incentive/IncentiveDataExport.tsx`
- `src/components/incentive/UnifiedProductionDataTab.tsx`
- tests, `DOCUMENTATION.md`, and `POLICY.md`
- optional migration only if the existing RPC must be extended for parity.

## 7. Tests
- Run targeted Vitest for `incentiveExportData.test.ts` and existing profile/RPC contract tests.
- Verify the Metal Sizing/Bihar path no longer returns an empty workbook and uses company rates.

## 8. DOCUMENTATION.md updates
Planned: add RCA 5-Why and CAPA entry for Upendra’s blank Incentive Data Entry Excel export.

## 9. POLICY.md updates
Planned: codify grid/export parity for selected-company daily exports and canonical rate cascade usage.

## 10. Post-implementation notes
Expected result: Upendra’s Excel download for Metal Sizing + Bihar Foundry & Casting Limited exports the relevant mapped Bihar employees with daily values and correct company-level rates, not a blank sheet.
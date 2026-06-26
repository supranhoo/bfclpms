## 1. Assumptions

- The screenshot is from **Upendra Singh** on `/reports/incentive`, with filters: **June 2026**, **Metal Sizing**, **Bihar Foundry & Casting Limited**, **All Periods**.
- The expected result is not blank: database checks show Metal Sizing has data for this period/company.
- Upendra and Sandeep are non-admin users with menu-based incentive access, so their behavior must not depend on broad direct access to the `profiles` table.
- “OpenSync perspective” means validating the same workflows through the operational access path used by OpenSync/support users. If there is a specific OpenSync login/persona, I will need the exact user identity before final browser validation.

## 2. Clarifications

- **Needed for final validation only:** Which exact account represents **OpenSync**? I found Upendra and Sandeep in the user/profile data, but no profile matching “OpenSync”.
- I can still implement the fix now because the root issue is clear and reproducible from code + database state.

## 3. Risk & Impact Report

### Data Impact

- **No destructive data changes planned.**
- One additive/replace migration is likely needed to enhance existing SECURITY DEFINER directory/roster RPCs so the app can resolve employee company, BU, and division safely without direct `profiles` reads.
- No historical incentive records, production entries, or mappings will be deleted.
- Backup impact is safe: no new public tables are planned, so backup table coverage does not change.

### Workflow Impact

- Incentive Report company filtering will change from **RLS-fragile client-side profile map** to **server-authoritative company_id resolved via RPC**.
- Incentive Data Entry daily/vessel filtering and exports will align with the on-screen roster.
- Compute scoping will use the same mapped roster as the grid/report, preventing empty or wrong company scopes for Upendra/Sandeep.
- Preventive correction: a program with **zero mappings** must compute/export as **zero employees**, not “all employees”.

### UI/UX Impact

- Minimal visible UI change.
- The same filters remain in the same locations.
- The main visible outcome: selecting **Programme + Company** should show the relevant employees/records instead of blank rows.
- Empty states may become more precise: “mapped employees exist but no computed records yet” vs generic “No records found”.

### Regression Risk

- Medium, because incentive data paths are shared by report, data-entry grid, compute, and export.
- Main risk is changing roster/company resolution in one path but not another.

### Scalability Impact

- Current code still has several 1,000-row-cap risks and RLS-sensitive reads.
- Plan will use paged table/RPC reads (`fetchAllPaged` / `fetchAllRpcPaged`) for large rosters and records.
- UI remains paginated at 50 rows by default; “All” remains existing behavior but should not be made broader.

### Mitigation Plan

- Use a single server-authoritative roster/company resolution path.
- Add regression tests for Upendra/Sandeep-like restricted profile visibility.
- Add tests for Metal Sizing + BFCL counts and zero-mapping safety.
- Validate with browser flows after implementation.

## 4. Detailed RCA — 5 Why

### Symptom

When Upendra filters **Incentive Report** by **Metal Sizing** and **Bihar Foundry & Casting Limited**, the UI shows **0 records** even though data exists.

### Database facts observed

For **Metal Sizing / June 2026**:

- Program exists and is active.
- Program mappings: **292 employee mappings**.
- Resolved mapped roster by company:
  - **Bihar Foundry & Casting Limited: 211 mapped active employees**
  - **Saibal Kunar: 69 mapped active employees**
- Existing computed incentive records:
  - **Bihar Foundry & Casting Limited: 220 employees / 230 rows / ₹165,584.25**
  - **Saibal Kunar: 49 employees / 64 rows / ₹180,968.705**
- Therefore, the blank report is not caused by missing data.

### 5 Why

1. **Why does the report show blank?**  
   `MonthlyIncentiveTable` filters incentive records by company using `employeeCompanyMap` from `useCompanyFilter`.

2. **Why does that filter remove all rows for Upendra/Sandeep?**  
   `useCompanyFilter` builds `employeeCompanyMap` via a direct `supabase.from('profiles').select(...)` read.

3. **Why is that direct read incomplete for Upendra/Sandeep?**  
   After PII hardening, non-admin users with menu overrides do not have broad `profiles` SELECT access. They only see their own/limited hierarchy profiles, not the full incentive roster.

4. **Why did the recent fix not fully solve it?**  
   The previous fix addressed **Data Entry daily export/grid** in specific places, but the **Incentive Report**, report compute scoping, report parity, vessel grid/export, and all-mode report fetch still have remaining RLS-fragile or direct-embed paths.

5. **Why was this allowed to recur?**  
   There is no single enforced SSOT for incentive roster/company filtering across grid/report/export/compute. Multiple independent implementations drifted.

### Root Cause

The root cause is **inconsistent incentive roster/company resolution**: some paths use the secure server-resolved roster RPC, while others still depend on direct `profiles` reads or embedded `profiles` joins that are RLS-restricted for non-admin operational users.

## 5. Step-by-step Plan

### Step 1 — Fix server-side roster/directory SSOT

- Update `get_profile_directory_entries_v2(_ids)` to return:
  - `company_id`
  - `business_unit_id`
  - `division_id`
  - `business_unit_name`
  - `division_name`
- Update `get_incentive_program_employees(_program_id)` to remain SECURITY DEFINER and include any missing mapping coverage, especially `pms_grade` if applicable.
- Keep execution restricted to authenticated users/service role; no anon widening.

**Verification:** read function metadata and run representative SQL counts for Metal Sizing/BFCL.

### Step 2 — Refactor report data fetching

- Update `useIncentiveRecords` so records get profile shape from the enhanced directory RPC, including `company_id`, BU, and division.
- Update `useIncentiveReportData` to stop embedding `profiles:employee_id(...)`; fetch records paged, then enrich via directory RPC in batches.
- Ensure report export uses the same enriched data so Employee/Code/Department/BU/Division columns are not blank.

**Verification:** report records for Metal Sizing/BFCL remain non-zero under non-admin profile visibility assumptions.

### Step 3 — Refactor company filtering in Incentive Report

- In `MonthlyIncentiveTable`, filter records by `r.profiles.company_id` from the enhanced RPC, not `employeeCompanyMap` from direct `profiles` reads.
- Replace compute scope source with a mapped-roster hook using `get_incentive_program_employees`, returning `{ id, company_id }` so company-scoped compute works for Upendra/Sandeep.
- Keep pagination and search behavior unchanged.

**Verification:** selecting Metal Sizing + BFCL should show the existing BFCL computed records instead of “0 of 0”.

### Step 4 — Refactor data-entry vessel and parity paths

- Update `useVesselRates` to resolve employee profile/company via the enhanced directory RPC.
- Pass `selectedCompanyId` into `VesselDataEntryGrid` and filter by RPC-resolved `profile.company_id`, not `filterByCompany`.
- Update `IncentiveDataExport` vessel path to use `selectedCompanyId` + RPC company IDs, matching the previous daily-export fix.
- Update `useIncentiveReportParity` so totals use RLS-safe company resolution instead of `employeeCompanyMap`.

**Verification:** vessel programs must not regress while daily Metal Sizing remains correct.

### Step 5 — Fix compute engine preventive gap

- Update `compute-monthly-incentives` so **zero mappings means zero employees**, not all active employees.
- Page large production inputs inside compute where still unpaged:
  - production daily entries
  - production rates
  - vessel entries/rates if needed
  - existing incentive records if needed
- Preserve current service-role backend behavior and audit-safe writes.

**Verification:** zero-mapping regression test and Metal Sizing compute dry-run still returns scoped rows.

### Step 6 — Regression tests and mock data

Add/extend tests for:

- Report company filter does not depend on `useCompanyFilter.employeeCompanyMap`.
- Upendra/Sandeep-like RLS-limited profile visibility still shows company-filtered incentive records.
- Mapped-roster hook uses `get_incentive_program_employees` and preserves company scope.
- Vessel data entry/export company filter uses RPC-resolved company ID.
- All-mode report fetch does not embed `profiles` directly.
- Compute edge function: zero mappings do not compute all employees.
- Large daily entries are paged past 1,000 rows.

### Step 7 — Browser validation plan

After implementation:

1. Restore preview auth/session where available.
2. Validate **Upendra**:
   - Incentive Data Entry → Metal Sizing → Bihar Foundry & Casting Limited.
   - Grid shows mapped/rated employees.
   - Download Excel contains relevant BFCL employees only.
   - Incentive Report → same filters shows non-zero records.
   - Export is not blank.
3. Validate **Sandeep** with the same menu-access perspective.
4. Validate **OpenSync** once exact user/persona is confirmed.
5. Capture final visible state and note any console/network errors.

## 6. UI Changes

- **Location:** Incentive Report filter/results table.
  - No layout change planned.
  - Behavior change: company filter should show matching employees/records.

- **Location:** Incentive Data Entry → production/vessel grids and Download Excel.
  - No layout change planned.
  - Behavior change: company selection scopes visible roster/export using secure roster data.

- **Responsiveness:** no new layout elements expected; existing responsive wrapping remains unchanged.

## 7. Implementation

Files likely to change after approval:

- `supabase/migrations/...sql` — enhance directory/roster RPCs and grants.
- `src/hooks/useIncentiveRecords.ts` — remove remaining direct profile embed path and enrich via RPC.
- `src/hooks/useIncentiveProgramMappingCount.ts` — add/use mapped roster hook from roster RPC.
- `src/hooks/useIncentiveReportParity.ts` — RLS-safe company filtering.
- `src/hooks/useIncentiveVesselRates.ts` — include RPC-resolved company ID.
- `src/components/incentive/MonthlyIncentiveTable.tsx` — company filtering + compute scope.
- `src/components/incentive/UnifiedProductionDataTab.tsx` — pass selected company to vessel grid/export.
- `src/components/incentive/VesselDataEntryGrid.tsx` — selected company filtering via profile company ID.
- `src/components/incentive/IncentiveDataExport.tsx` — selected company filtering for vessel export too.
- `supabase/functions/compute-monthly-incentives/index.ts` — zero-mapping guard + paged production reads.
- Tests under `src/test/` and edge-function tests as applicable.

## 8. Tests

Planned test commands after implementation:

- Targeted Vitest for incentive report/export/grid hooks.
- Edge-function tests for compute guardrails where existing Deno test pattern supports it.
- Browser validation for the actual report/data-entry flows.

## 9. DOCUMENTATION.md updates

- Add a new version-history entry documenting:
  - Blank report after Program + Company filter.
  - RCA 5-Why.
  - DB evidence proving data exists.
  - CAPA across report, data entry, export, compute, and tests.

## 10. POLICY.md updates

- Add/update incentive policy:
  - Company filtering for incentive workflows must use RPC-resolved employee company IDs.
  - Direct `profiles` reads must not be used for incentive roster/company filtering in non-admin workflows.
  - Grid/report/export/compute must share the same mapped-roster semantics.
  - Zero mappings must resolve to zero employees.

## 11. Post-implementation notes

- Rollback strategy: revert code changes and the RPC migration if needed; no data deletion is planned.
- Remaining possible data-quality observation: June 2026 daily entries include many employees outside current Metal Sizing mappings. I will not delete or alter those rows in this fix; the corrected UI/export/report should ignore them unless explicitly mapped.
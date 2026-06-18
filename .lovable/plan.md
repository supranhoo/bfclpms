## 1. Assumptions
- This is about **Incentive Configuration → Metal Sizing → Employee Mapping** and the downstream visibility in **Incentive Data Entry → Metal Sizing**.
- The mapping table is expected to support programs with more than 1,000 directly mapped employees. Current Metal Sizing has **2,560 employee mapping rows**, so any unpaged read is unsafe.
- The desired UX is: selecting employees should **not immediately persist** each click; admins should be able to review additions/removals and then save.

## 2. Clarifications
- Not required before implementation: I will default to a safe staged-save UX with **Apply Changes** and **Discard Changes**.
- I will keep the fix focused on incentive employee mapping and mapping consumers; I will not expand into unrelated Incentive Data Entry Excel filters unless you ask separately.

## 3. Risk & Impact Report
- **Data Impact:**
  - No schema change planned.
  - Existing `incentive_program_mappings` rows remain intact.
  - Add/remove operations will still target the existing unique constraint: `(program_id, mapping_type, mapping_value)`.
- **Workflow Impact:**
  - Mapping changes become staged: checkbox clicks modify a local draft, and persistence happens only when the admin clicks **Apply Changes**.
  - Explicit unmap support will be added for selected/mapped employees.
- **UI/UX Impact:**
  - Mapping grid will show pending additions/removals before save.
  - Add clear actions: **Apply Changes**, **Discard Changes**, **Unmap Selected**, and a mapped/unmapped/all view filter.
- **Regression Risk:**
  - Medium: mapping is used by configuration, eligibility, daily production entry, custom tabs, reports, and compute functions.
  - Main risk is accidentally changing eligibility resolution semantics; mitigation is shared helper/service plus tests using >1,000 rows.
- **Scalability Impact:**
  - Fixes the 1,000-row PostgREST cap by paging mapping reads with `.range()`.
  - Bulk add/remove will be chunked, default batch size **500**, to avoid request-size and URL-length failures.
  - UI remains client-paginated for the full active employee roster, which is already loaded through `fetchAllPaged`.
- **Backup/Data Integrity:**
  - No new tables; existing backup coverage remains unchanged.
- **Rollback Strategy:**
  - Revert the service/hook/UI changes. No destructive migration or data conversion is involved.

## 4. Step-by-step Plan

### Step 1 — Centralize incentive mapping access
Create a small service/helper layer for incentive mapping operations:
- `fetchProgramMappingsPaged(programId)`
  - Uses `fetchAllPaged` over `incentive_program_mappings`.
  - Stable ordering by `created_at` and/or `id`.
  - Returns all mapping rows, not just the first 1,000.
- `bulkAddProgramMappingsBatched(rows)`
  - Uses batches of 500.
  - Uses duplicate-safe write behavior against the existing unique constraint.
- `bulkRemoveProgramMappingsBatched(ids)`
  - Deletes by mapping IDs in batches of 500.

### Step 2 — Fix all mapping reads that can truncate at 1,000
Update the following consumers to use the paged mapping helper:
- `useProgramMappings()` in `src/hooks/useIncentivePrograms.ts`
- `ProductionDailyGrid` mapped employee query
- `useResolvedProgramEmployees()` in `src/hooks/useIncentiveEligibility.ts`
- `useIncentiveProgramMappedEmployeeIds()` in `src/hooks/useIncentiveProgramMappingCount.ts`
- `CustomTabDataGrid` mapped employee query
- Relevant incentive compute/export paths where `incentive_program_mappings` is currently read without `.range()`

This directly addresses the Metal Sizing case where 2,560 rows exist but only 1,000 may be read.

### Step 3 — Fix profile-list cap in eligibility mapping
`useResolvedProgramEmployees()` also has an unpaged `profiles` list read. Replace it with `fetchAllPaged` per the existing Profiles Query Policy so employees beyond the 1,000th active profile are not hidden.

### Step 4 — Redesign ProgramEmployeeMapping persistence UX
Change `ProgramEmployeeMapping` from immediate mutation-on-click to staged editing:
- Load saved mapped IDs into `savedMappedSet`.
- Maintain `draftMappedSet` locally.
- Checkbox click toggles draft state only.
- Show counters:
  - Saved mapped count
  - Pending additions
  - Pending removals
- Add actions:
  - **Apply Changes**: batch-add new IDs and batch-remove removed IDs
  - **Discard Changes**: reset draft to saved state
  - **Unmap Selected** / checkbox toggles for mapped rows
- Disable save while mutation is pending.
- Refresh mapping query after successful apply.

### Step 5 — Add clear remove/unmap controls
Add visibility and controls that make removal obvious:
- View filter: **All / Mapped / Unmapped / Pending Changes**
- Header checkbox behavior:
  - In Mapped view: unmap filtered rows from draft
  - In Unmapped view: map filtered rows into draft
  - In All view: apply current all-filtered behavior but staged only
- Keep existing search and org filters.

### Step 6 — Preserve downstream data entry behavior
Do not change production-entry formulas or rate resolution.
Only ensure the data-entry grids receive the complete mapped employee set.

### Step 7 — Add audit trail where feasible
For successful bulk mapping changes, add a `system_audit_logs` entry containing:
- action name such as `incentive_program_mapping_bulk_update`
- program ID
- added count
- removed count
- performed user ID when available

If client-side audit insertion is blocked by RLS, implement this as a follow-up via approved backend function/RPC; do not weaken RLS.

## 5. UI Changes
- **Location:** Incentive Configuration → selected program → Employee Mapping.
- **Visual changes:**
  - Add a staged-change action bar above the table.
  - Add mapped status/view filter.
  - Add pending-change badges.
  - Add explicit save/discard controls.
- **Interaction impact:**
  - Clicking a checkbox no longer immediately writes to the database.
  - Admins can remove mapped employees by unchecking them and applying changes.
- **Responsiveness:**
  - Keep existing responsive filter grid.
  - Keep table pagination at 20 rows unless changing it is requested.
  - Ensure action buttons wrap on smaller screens.

## 6. Implementation
- Build a mapping service/helper first.
- Refactor hooks to use the service.
- Refactor `ProgramEmployeeMapping` state model from immediate persistence to draft persistence.
- Update mapping consumers to use paged reads.
- Keep changes surgical; no unrelated refactors.

## 7. Tests
Add regression tests with realistic mock data:
- **Mapping pagination test:** simulate 2,560 mapping rows and assert all are returned, including rows beyond index 1,000.
- **Draft UX logic test:** saved set + draft toggles produce correct additions/removals.
- **Batch write test:** 1,200 additions/removals are split into 500-sized batches.
- **Data-entry visibility regression:** employee mapped beyond row 1,000 remains visible after mapping resolution.
- **Profile paging regression:** `useResolvedProgramEmployees` uses `fetchAllPaged` and `.range()` for active profiles.

## 8. DOCUMENTATION.md updates
Update documentation with:
- Root cause: `incentive_program_mappings` reads were unpaged, causing Metal Sizing’s 2,560 mappings to truncate at 1,000.
- New mapping UX: staged edits with apply/discard.
- New technical standard: incentive mapping list reads must use paged helpers.
- Version history entry for this bug fix.

## 9. POLICY.md updates
Add/extend policy:
- Incentive program mappings are large datasets and must never be read through unpaged `.select()` calls.
- Bulk mapping operations must be batched.
- Mapping UI must support both add and remove flows explicitly.
- Direct checkbox clicks must not silently persist without a visible pending/save flow.

## 10. Post-implementation notes
- After implementation, verify Metal Sizing shows all mapped employees consistently in Configuration and Data Entry.
- Re-check any program with more than 1,000 mappings.
- If compute/report paths still show discrepancies, inspect edge-function mapping resolution next, but the planned sweep should cover the known unpaged reads.
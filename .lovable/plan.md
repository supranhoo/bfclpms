## Goal
Add two HR fields to the user lifecycle UI and Excel I/O:
1. **Confirmation Date** — date input shown immediately after **Date of Joining (DOJ)**.
2. **Location** — combobox of active locations (master data), shown immediately after **Employment Status**.

Both must round-trip through the Add User dialog, Edit User dialog, Employee Excel template, Import flow, and Export file.

## Assumptions
- `profiles.confirmation_date` (date) and `profiles.location_id` (uuid → `public.locations`) already exist — confirmed in DB. No schema migration needed.
- `useLocations()` hook already exists in `src/hooks/useOrganization.ts` returning active locations; we'll reuse it (company-scoped when a company is selected in the Create form, unfiltered in Edit to avoid hiding the current value).
- The Edit dialog should mirror the Create dialog for these two fields (otherwise editing existing records would break parity).
- Import matches Location **by name** (case-insensitive) to `locations.name`, consistent with how the existing `create-employee` edge function already resolves Location text → `location_id`. Unmatched names insert NULL and produce a row warning (existing pattern).
- Confirmation Date in Excel accepts `yyyy-MM-dd`, `dd/MM/yyyy`, or Excel date serial, normalized through the existing `normalizeDateCell` helper.

## Risk & Impact Report
- **Data Impact:** None to schema. Writes optional values into existing nullable columns. Backfill not required.
- **Workflow Impact:** None — neither field gates any workflow. Confirmation Date does feed the existing Confirmation Increment adjuster (already reads `profiles.confirmation_date`), so capturing it here improves that engine's accuracy.
- **UI/UX Impact:** Two new fields in Create/Edit dialogs, two new columns in Employee import template / parsed rows / export file, two new bullets in the column-help block.
- **Regression Risk:** Low. Fields are additive and optional. Existing imports without the new columns continue to work because `getValue` / `getRaw` return `undefined`.
- **Scalability:** No new queries beyond reusing `useLocations()` + resolving location names in export via one `in()` lookup (same pattern as departments/BUs).

## Plan (Step → Verification)

### 1. UserManagement.tsx — Create dialog
- New state: `newConfirmationDate`, `newLocationId`.
- Add **Confirmation Date** field directly after DOJ inside the Personal Information grid (same date-input pattern, calendar icon).
- Add **Location** field directly after Employment Status in the Organization grid (`OrgFilterCombobox` fed by `useLocations(newCompanyId)`, falling back to all locations when no company is chosen).
- Extend `createUser.mutate(...)` payload + the mutation's input type with `confirmation_date` and `location_id`.
- Extend `resetCreateForm()` to clear both.
- **Verify:** open Add New User → both fields render in the stated positions, save persists to `profiles`.

### 2. UserManagement.tsx — Edit dialog
- New state: `editConfirmationDate`, `editLocationId`; hydrate from `selectedUser`.
- Add the same two fields in the same positions inside the Edit dialog grids.
- Extend `updateUser` mutation input + `updatePayload` with `confirmation_date` and `location_id` (only send when defined, mirroring `group_doj`/`doj` handling).
- **Verify:** open Edit on a user with existing values → fields prefill; change & save persists; clearing them writes NULL.

### 3. create-employee edge function (`supabase/functions/create-employee/index.ts`)
- Accept new optional body fields `confirmation_date` and `location_id`.
- When `location_id` is provided, use it directly (skip the name lookup).
- When `confirmation_date` is provided, include `confirmation_date: body.confirmation_date` in the profiles insert.
- Keep the existing name-based `location` resolver intact for Excel imports.
- **Verify:** create user with both fields from UI; row in `profiles` has both columns populated. No regression for callers that omit them.

### 4. ImportData.tsx — Employee template + parser
- Extend `EmployeeRow` interface with `confirmationDate?: string`.
- In the template object (`downloadEmployeeTemplate`), insert `confirmationDate: '2021-04-15'` immediately after `doj` (Location key already exists).
- In `parseEmployeeRow`, add a `getRaw(['confirmationDate','confirmation_date','confirmDate','confirm_date'])` plus `normalizeDateCell`; assign as `'INVALID'` sentinel on bad input, same as `doj`.
- Add a row-level validation message: *"Confirmation Date is invalid — use yyyy-MM-dd or dd/MM/yyyy"*.
- In the create-employee payload (lines ~1392, 1461), forward `confirmation_date` when present.
- Update the column-help bullets in the Import help block to list `confirmationDate` and confirm `location` is already documented.
- **Verify:** download template → column appears between `doj` and the next column; import a sample row with both fields → profile updated; invalid date surfaces the new error.

### 5. ImportData.tsx — Employee export
- Extend the profiles `.select(...)` (line 1778) to include `confirmation_date, location_id`.
- After the existing dept/BU/div lookups, add a bounded `locations` lookup (`supabase.from('locations').select('id, name').in('id', uniqueLocationIds)`) and build `locationMap`.
- In the `exportData.map(...)` block, insert `location: locationMap.get(profile.location_id)?.name || ''` immediately after `employmentStatus`, and `confirmationDate: profile.confirmation_date || ''` immediately after `doj`.
- **Verify:** export the workbook → both new columns present in stated positions with correct values; ordering of remaining columns unchanged.

## UI Changes (Summary)
| Where | Position | Field | Control |
|---|---|---|---|
| Add New User → Personal Info grid | After DOJ | Confirmation Date | `<Input type="date">` with calendar icon |
| Add New User → Organization grid | After Employment Status | Location | `OrgFilterCombobox` (active locations) |
| Edit User → same two grids | Same positions | Same fields | Same controls |
| Excel template / export | Confirmation Date after `doj`; Location after `employmentStatus` | Same two columns | Plain cells |

No layout reflow — both grids already use `md:grid-cols-3`, so adding one cell each just fills the row.

## Files Touched
- `src/pages/admin/UserManagement.tsx` (Create + Edit dialogs, both mutations)
- `supabase/functions/create-employee/index.ts` (accept `confirmation_date`, `location_id`)
- `src/pages/admin/ImportData.tsx` (template, parser, validation, payload, export, help text)

No DB migration. No new dependencies. No new components.

## Rollback
Revert the four files; profiles columns remain unused but harmless. No data cleanup required.

Ready to implement on approval.
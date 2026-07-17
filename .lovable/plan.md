# Fix: Prabhat (101757) can't see Mukesh Bedia (100956)

## Root cause
`public.annual_review_directory_access(uid)` currently returns exactly one `business_unit_id` and stops at the first matching rule. For 101757 it matches Rule 4 (HOD of dept **Admin-Pollution**, BU **Admin** `ea9b1de1…`) and returns `scope='bu', business_unit_id=Admin`. His **home** BU (dept `1050 TPD-Mech` → BU `1050 TPD` `88e3ed27…`), where Mukesh Bedia sits, is never included. `search_active_employees_for_review` therefore filters Mukesh out.

Mukesh does **not** report to Prabhat (his `reporting_manager_id` is a different user), so the `team` fallback wouldn't help either — and it never runs because `bu` already matched.

## Decision
Widen `scope='bu'` to a **set of BUs** instead of one. A user's BU scope becomes the union of:
1. BUs where they are `business_units.head_user_id` (BU Head).
2. BUs of departments where they are `departments.head_user_id` (HOD) — current behaviour.
3. **NEW:** their own home BU (`departments.business_unit_id` of `profiles.department_id`) **only if** they also qualify under rule 1, 2, or the team rule (has direct/skip reports, or already assigned as manager/skip on an AR instance). Pure line staff without any leadership signal do not gain BU-wide access from home BU alone — that would be a privilege expansion.

Admin / HR PMS / HR-BU keep `scope='all'`. Plain managers with no headship keep `scope='team'`.

## Backend changes (one migration, ADR-111)
1. `annual_review_directory_access(uid)` returns `{can_access, scope, business_unit_ids: uuid[], business_unit_id}` where `business_unit_id` remains populated with the first entry for backwards compatibility. Scopes: `all` (unchanged), `bu` (array of BUs — union of rules 1/2/3 above), `team` (unchanged).
2. `search_active_employees_for_review(...)`: when `scope='bu'`, filter `department.business_unit_id = ANY(business_unit_ids)` instead of `= business_unit_id`.
3. `create_or_get_annual_review_instance(...)`: same `ANY(...)` check on write; reject out-of-scope with `42501`.
4. Preserve first-match precedence: Admin/HR still short-circuit to `all`; team rule only fires when the BU set is empty.

## Frontend changes
- `useDirectoryAccess`: expose `businessUnitIds: string[]` (derived — fall back to `[businessUnitId]` when the RPC hasn't been redeployed yet). No UI copy change; the "BU employees" button label stays.
- No change to `EmployeeDirectoryDialog`; server does the filtering.

## Tests
- `directoryAccess.test.ts`: new case — HOD-of-A whose home BU is B returns both BUs.
- `employeeDirectory.test.ts`: search returns rows in either BU.
- Post-migration psql check: `annual_review_directory_access('223ba922-…')` returns `business_unit_ids` containing both `ea9b1de1` (Admin) and `88e3ed27` (1050 TPD); Mukesh `100956` appears in the search result set for a query = "mukesh".

## Governance
- `POLICY.md` §AR-DIRECTORY-ACCESS-MATRIX: Rule 3 (HOD) note updated — HODs additionally see their own home BU.
- `docs/adr/ADR-111.md` documenting the multi-BU scope change and the "home BU only with a leadership signal" guardrail.
- `mem/features/annual-review/directory-access.md` refreshed.

## Risk & rollback
Additive: broadens BU visibility for HODs / BU Heads only. Line staff unaffected. Reverting the migration restores single-BU behaviour; frontend fallback (`[businessUnitId]`) keeps working against the old resolver.

## Out of scope
No change to review stage logic, reviewer resync, BU-Head-terminal (ADR-109), or the global `annual_review_directory_search_enabled` flag.

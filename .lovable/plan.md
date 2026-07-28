# Functional Manager "not saving" (102028) + FM stage on dashboards

## 1. What I verified

| Check | Result |
|---|---|
| `profiles` row for 102028 (Brundaban Chandra Das) | `functional_manager_id = 59a7d12e…` = **V.A.V.S.S. Ganapathi Varma (200271)** — **the save DID persist** |
| Update payload in `UserManagement.tsx:685-715` | Includes `functional_manager_id`; writes to `profiles` and errors loudly if RLS filters the row |
| Roster RPC `get_reviewer_roster_slim()` | Returns `id, full_name, employee_code, email, designation, pms_grade, department_id, reporting_manager_id, avatar_url, level, is_active, company_id` — **`functional_manager_id` is NOT in the return signature** |
| Edit dialog hydration | `openEditDialog` (line 1015) reads `user.functional_manager_id` from that roster row; the supplemental `profiles` fetch (line 1039) selects 7 columns and **does not include `functional_manager_id`** |

## 2. Root cause — it is a read-back defect, not a write defect

The write works. The **read path never returns the column**, so every time the Edit User dialog is reopened the Functional Manager select is initialised to `''` and renders empty. To the admin this is indistinguishable from "saved successfully but not stored", so the same value gets re-entered repeatedly.

**5 Why**
1. Why does FM look unsaved? The Edit User dialog shows it blank after reopening.
2. Why blank? `editFunctionalManagerId` is seeded from the roster row's `functional_manager_id`.
3. Why is that undefined? `get_reviewer_roster_slim()` does not select the column.
4. Why not? The RPC was deliberately made "slim" for performance and FM was added to `profiles` later; ADR-193 added *functional reports* to rosters but never added the *column* to this signature.
5. Why did nothing catch it? There is no invariant that every field editable in the Edit User dialog must be present in a read path, and no test asserting write-then-read round-trip for profile fields.

Same blind spot affects any other surface reading FM off this roster.

## 3. Risk & impact
- **Data:** none — read-only additions. No values are rewritten; 102028's existing mapping stays as is.
- **Workflow:** none directly; correct FM display makes F1 workflow mappings verifiable.
- **UI/UX:** the FM select in Edit User will now show the stored value instead of blank.
- **Scalability:** adding one uuid column to a ~2,600-row roster RPC is negligible; the supplemental fetch is a single-row read.
- **Regression risk:** low, but the RPC return signature change requires `DROP FUNCTION` + recreate (Postgres cannot change `RETURNS TABLE` in place) — any concurrent caller must keep working. All callers spread the row object, so extra columns are safe.
- **Rollback:** revert migration to the previous signature.

## 4. Plan — Part A: fix Functional Manager persistence visibility

**A1. Add `functional_manager_id` to the roster RPC (migration)**
Drop and recreate `get_reviewer_roster_slim()` with `functional_manager_id uuid` appended to the return table, added to all branches of the function body (full-access, admin-users, and the scoped fallback branch).
*Verify:* query the RPC and confirm 102028's row carries the FM uuid.

**A2. Add the column to the supplemental hydration fetch**
`UserManagement.tsx:1039` — include `functional_manager_id` in the select and set `editFunctionalManagerId` from the fetched row in the `.then()` handler. This makes the dialog correct even if the roster cache is stale.
*Verify:* open 102028 → Edit User → Functional Manager shows "V.A.V.S.S. Ganapathi Varma (200271)".

**A3. Show FM in the user list**
Add a "Functional Manager" column (or a secondary line under "Reporting To") in the All Users table so admins can confirm the mapping without opening the dialog.

**UI changes explicitly**
- *What changes:* Edit User → Organization → Functional Manager renders the stored value instead of blank; All Users table gains an FM indicator.
- *Where:* `/admin/users` list row and Edit User dialog.
- *Interaction:* unchanged — select still writes on Save Changes.
- *Responsive:* the FM value is shown as a sub-line under Reporting To on narrow widths, not a separate column, so the table does not overflow on mobile.

**A4. Round-trip regression test**
Unit test with mock profile data asserting that the field set written by `updateUser` is a subset of the fields returned by the read paths (roster + supplemental fetch) — this catches the next field that gets added to the editor but not the reader.

## 5. Plan — Part B: the dashboard F1 stage (previously agreed, unchanged)

Now unblocked, since 102028 does have an FM mapped.

- **B1.** Extend `src/lib/reviewConstants.ts` into a canonical ordered stage SSOT (label + icon + colour), mirroring `canonical_stage_order()` in SQL.
- **B2.** Consume it in `WorkflowProgressTracker.tsx` (adds the missing "Functional Manager" stage card between Manager Check and Audit), `KpiTimeline.tsx` (`ALL_WORKFLOW_STAGES`), and `KpiFilterBar.tsx` (all 8 status chips).
- **B3.** Remove remaining hardcoded stage arrays in `useAdminDataEntry.ts`, `useKpiRollbackRequests.ts`, `AllKpis.tsx` and the `ReviewStatus` unions in `useKpiFilters.ts` / `useKpis.ts`.
- **B4.** Add a validation warning when an F1-containing workflow template is assigned to an employee with `functional_manager_id IS NULL`, plus a report of any such employees.
- **B5.** Tests: stage SSOT completeness vs the DB enum; tracker renders F1 only for F1 workflows.

*Verify:* 102028's dashboard stage strip reads KRA Set → Self Review → Manager Check → **Functional Manager** → Audit → Approved, with July's 13 `kra_set` + 7 `self_review` counted in the right columns.

## 6. Docs
ADR-194 (FM read-path parity + client stage SSOT), `POLICY §FM-REVIEWER-SCOPE` extended to forbid hardcoded stage lists in UI and to require read/write field parity for the Employee Master editor, and `DOCUMENTATION.md`.

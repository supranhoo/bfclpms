## ADR-147 — Exclude upline officers from an HOD's directory scope

### Root cause (verified)
- Sajid Raza (100264) — `department_id = 1050 TPD-Process`, and also `business_units.head_user_id` for `1050 TPD`.
- Jyoti (101789) — HOD of `1050 TPD-Process` (same department).
- ADR-146 restricts an HOD's `search_active_employees_for_review` / assist scope to `department_ids = [own dept]`. Membership alone qualifies Sajid, so he appears in Jyoti's directory even though he is her BU Head.

The resolver has no "don't let a junior see their senior" rule. It must exclude the BU Head of the HOD's BU (and, for symmetry, any Management/Skip‑level above the HOD) from the HOD's department scope.

### Fix
Add an **upline-exclusion filter** to the `department`-scoped path only. Do not touch `all` / `bu` / `team` scopes.

Excluded from an HOD's department scope:
1. `business_units.head_user_id` of the HOD's BU (Sajid case).
2. Any user who is the HOD themselves (self — already excluded elsewhere, re-affirm).
3. Any user whose `annual_review_instances.management_id` chain resolves upstream of the HOD in that cycle (defensive; skip if not cheap to compute — flag for follow-up).

Rules 1–2 are the concrete fix; rule 3 is only added if it's a single join.

### Changes
1. **Migration `20260723_adr_147_hod_upline_exclusion.sql`**
   - Update `public.annual_review_directory_access(uid)` — no signature change; when `v_scope = 'department'`, also return `excluded_user_ids uuid[]` containing the BU Head(s) of the HOD's BU.
   - Update `public.search_active_employees_for_review(...)` to apply `AND p.id <> ALL(excluded_user_ids)` in the `department` branch.
   - Update `public.create_or_get_annual_review_instance(...)` to reject creation when the target employee is in `excluded_user_ids` (raise `ADR-147: cannot start review for upline officer`).
   - Update `public.get_annual_review_access_explain(uid)` to surface `excluded_user_ids` with reason `"upline: BU Head"` so the Access Control "Scope Viewer" shows why.
   - Audit event `annual_review.access.upline_blocked` when create is refused.

2. **Frontend**
   - `src/services/annualReview/employeeDirectory.ts` — no signature change; RPC filters server-side.
   - `src/hooks/useDirectoryAccess.ts` — add optional `excludedUserIds: string[]` to `DirectoryAccess` for display only.
   - `src/components/admin/annualReview/AccessControlTab.tsx` — show excluded IDs in the Scope Trace card.

3. **Docs & policy**
   - New ADR `docs/adr/ADR-147.md`.
   - `POLICY.md` §AR-DIRECTORY-ACCESS-MATRIX — append rule: "HOD department scope excludes the BU Head of that BU."
   - `mem/features/annual-review/directory-access.md` — add exclusion clause.

4. **Tests**
   - `src/test/annualReview/directoryAccess.test.ts` — add case: HOD sees own-dept members but not BU Head of own BU.
   - SQL smoke: `SELECT search_active_employees_for_review('sajid', <cycle>, 50, 0)` invoked as Jyoti returns 0 rows.

### Risk & impact
- **Data**: read-only resolver change + one new exclusion filter. No schema mutation on core tables (only optional audit row).
- **Workflow**: HODs lose the ability to open a review for a BU Head who sits in their department (correct). BU Head can still self-review, and their own reviewer (Management) is unaffected.
- **Regression**: `all` / `bu` / `team` scopes untouched; only the `department` branch narrows. HR/Admin still see everyone.
- **Rollback**: revert migration — resolver falls back to ADR-146 behaviour.

### Verification steps
1. As Jyoti, search "sajid" → 0 rows.
2. As Jyoti, search a peer in `1050 TPD-Process` → visible.
3. As BU Head / Admin, Sajid still appears.
4. `get_annual_review_access_explain(jyoti)` lists Sajid under `excluded_user_ids` with reason.

Not applicable: UI layout changes, mock data updates beyond the test above.
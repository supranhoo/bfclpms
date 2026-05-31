## RCA

The data **is being saved correctly**. Verified in DB for Debadutta Sahoo (101358):

| Column | Value in DB |
|---|---|
| group_doj | 2025-05-26 |
| doj | 2025-05-26 |
| confirmation_date | 2026-05-26 |
| location_id | 1f8744a3-…-0659a37 |
| employee_category | Trainee |
| employment_status | Trainee |

The bug is on the **read path**, not the write path.

`UserManagement.tsx` powers its roster via `useProfiles()` → RPC `public.get_reviewer_roster_slim()`. That RPC's RETURNS TABLE is a **slim** projection:

```
id, full_name, employee_code, email, designation, pms_grade,
department_id, reporting_manager_id, avatar_url, level,
is_active, company_id
```

It deliberately omits `group_doj`, `doj`, `confirmation_date`, `location_id`, `employee_category`, `employment_status`, `mobile_number` for list-page performance.

`openEditDialog(user)` then does:
```ts
setEditGroupDoj((user as any).group_doj || '');
setEditDoj((user as any).doj || '');
setEditConfirmationDate((user as any).confirmation_date || '');
setEditLocationId((user as any).location_id || '');
setEditEmployeeCategory((user as any).employee_category || '');
setEditEmploymentStatus((user as any).employment_status || '');
```

Because those keys don't exist on the slim row, every field hydrates to `''` → the dialog renders empty placeholders even though the DB row is intact. Save sends the empty form back, which overwrites correct values with `null` if the admin clicks Save Changes again without re-entering them — a real data-loss hazard, not just a display bug.

## Risk & Impact

- **Data Impact**: Read-only fix; no schema change. Closes a silent data-loss path where an unsuspecting admin re-saves a blank dialog.
- **Workflow Impact**: None. Admin-only screen.
- **UI/UX**: Edit User dialog now shows actual current values for these 7 fields (incl. mobile_number which has the same defect).
- **Regression Risk**: Low. Single targeted fetch fired only when the Edit dialog opens.
- **Scalability**: One PK-indexed `profiles` select on dialog open — negligible.
- **Mitigation**: Disable Save until fetch resolves; show inline loader; on fetch error keep dialog closed with a toast (no silent partial state).

Rejected alternatives:
1. *Widen `get_reviewer_roster_slim`* — defeats its performance purpose (loaded for 2,500+ employees on every roster page).
2. *Fetch full row in `useProfiles`* — same perf regression.

## Plan

**File:** `src/pages/admin/UserManagement.tsx` only.

1. In `openEditDialog(user)`:
   - Open the dialog immediately, set known slim fields (name, code, dept, designation, grade, manager, role, is_active).
   - Fire a one-off `supabase.from('profiles').select('group_doj, doj, confirmation_date, location_id, employee_category, employment_status, mobile_number').eq('id', user.id).maybeSingle()`.
   - On success, hydrate the 7 edit-state setters from the returned row.
   - While in-flight, set a local `editHydrating` flag; disable Save Changes and show a small spinner on the dialog body.
   - On error: toast + close dialog (do not let admin save a half-hydrated form).

2. No change to update mutation, schema, RPC, or list rendering.

3. Tests (`src/test/userManagement.editHydration.test.tsx`, new):
   - Hydrates all 7 fields from the supplemental fetch.
   - Save button disabled until hydration resolves.
   - Fetch error closes dialog and toasts.

4. Doc updates:
   - `DOCUMENTATION.md` → "User Management → Edit User" note that dialog hydrates via supplemental `profiles` fetch because the roster RPC is intentionally slim.
   - `POLICY.md` → add clause: *"Any edit form bound to a slim-RPC list MUST re-fetch the authoritative row before allowing Save; never assume list projection contains all editable columns."*
   - Memory note under `mem://architecture/profiles-query-policy`.

## Out of Scope

- Changing `get_reviewer_roster_slim` signature.
- Bulk import paths, Add User dialog (already collects fresh input), Access & Login tab.
- Any UI redesign of the dialog.

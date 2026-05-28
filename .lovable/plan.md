## 1. Assumptions
- Avinash (101732) is mapped to an active access profile with `admin-users` view rights.
- His Org Level Scope should include both active and inactive employees for User Management counters and the Inactive filter/list.
- Write actions remain unchanged and should not be opened to non-admin users.

## 2. Clarifications
- Not Applicable — the reported behavior is reproducible from the current database function definitions.

## 3. RCA
The latest RLS policy change removed the direct `profiles.is_active = true` condition, but the policy still calls:

```sql
public.user_can_see_employee(auth.uid(), id)
```

That helper delegates to:

```sql
public.get_visible_employee_ids(p_user_id)
```

Current `get_visible_employee_ids` still has `WHERE p.is_active = true` in both branches. So inactive employees are still excluded before RLS/count queries can see them.

There is a second related issue: `get_reviewer_roster_slim()` also still filters the access-profile branch with `WHERE p.is_active = true`. Therefore even if the counter were fixed, Avinash’s User Management table would still not show inactive rows when selecting the Inactive status filter.

Verified current data shape:
- Avinash has `admin-users` view access: `true`
- Current visible helper returns: `2538`
- Inactive employees inside the same Org Level Scope: `10`
- Expected scoped totals: `2548 total`, `2538 active`, `10 inactive`

## 4. Risk & Impact Report
- **Data Impact:** No table data changes. Only database helper/RLS function behavior changes.
- **Workflow Impact:** Avinash and similarly scoped User Management viewers will be able to see inactive employees within their assigned Org Level Scope. Write permissions remain admin-only.
- **UI/UX Impact:** The existing Total / Active / Inactive cards and Inactive filter will start reflecting scoped inactive employees; no visual redesign.
- **Regression Risk:** Medium if we globally remove `is_active = true` from the existing helper, because other features may depend on active-only visibility.
- **Scalability Impact:** Scoped visibility currently joins profiles, departments, business units, locations, and access profile scope rows. The change should preserve the same join pattern and continue using existing paged fetching for rosters.
- **Mitigation Plan:** Add a separate User Management scoped helper instead of weakening the existing active-only helper globally.
- **Rollback Strategy:** Revert the new function/RPC definitions to the prior active-only behavior via one migration.

## 5. Step-by-step Plan
1. **Add a dedicated scoped helper for User Management**
   - Create `public.get_user_management_visible_employee_ids(p_user_id uuid)`.
   - It will use the same Org Level Scope matching logic as `get_visible_employee_ids`, but will not filter out inactive employees.
   - Admin branch can return all profiles including inactive.

2. **Update scoped profile RLS for User Management readers**
   - Change the `Profile-granted users can view scoped profiles` policy to use the new User Management helper.
   - This lets head-count queries on `profiles` correctly count inactive employees in scope.
   - Other active-only helpers remain unchanged for non-User-Management screens.

3. **Update `get_reviewer_roster_slim()` for the `admin-users` access-profile branch**
   - Keep full-role and normal manager/employee branches unchanged.
   - For `has_profile_menu_access(uid, 'admin-users', 'view')`, join against the new helper and remove `p.is_active = true` only in that branch.
   - This makes the table’s Inactive filter work, not just the stat card.

4. **Update the client-side scope filter hook**
   - Change `useMyVisibleEmployeeIds()` to call the new User Management helper so the client filter does not re-drop inactive rows.

5. **Add regression coverage**
   - Update `orgScopeVisibility.test.ts` with an inactive employee case proving scoped User Management visibility includes inactive users while the existing generic helper remains documented as active-only.

6. **Update project policy/docs artifacts**
   - Add a concise policy note that User Management scoped visibility includes inactive employees for accurate admin-style counters and status filtering, while general employee visibility remains active-only.

## 6. UI Changes
- **Visual changes:** None.
- **Location:** `/admin/users` statistic cards and status-filtered table.
- **Interaction impact:** Selecting `Inactive` should show scoped inactive employees instead of an empty list.
- **Responsiveness:** Not affected.

## 7. Implementation
- Pending approval. No files will be changed until this plan is approved.

## 8. Tests
- Add/update a unit test for scoped visibility including inactive employees in the User Management context.
- Validate with database reads after migration:
  - Avinash scoped total should be `2548`.
  - Avinash scoped inactive should be `10`.
  - User Management inactive card should show `10` after refresh.

## 9. DOCUMENTATION.md updates
- Add/update the User Management access note: access-profile viewers see all employees in their Org Level Scope, including inactive, for status governance.

## 10. POLICY.md updates
- Add/update the policy: general employee visibility remains active-only, but User Management is an exception because it owns employee activation/deactivation visibility.

## 11. Post-implementation notes
- Avinash should hard refresh `/admin/users` after the migration because React Query caches `profiles` and `user-mgmt-stats` briefly.


## Plan — Show Inactive Employees in User Management List

### Root Cause

The User Management page (`/admin/users`) currently filters out inactive employees from the list, so once you deactivate someone they vanish from the table — making it impossible to find, review, or reactivate them.

This contradicts the intent of the `is_active` lifecycle: deactivated users should remain **visible but clearly marked**, not hidden.

### Fix — Add a Status Filter (default: All)

In `src/pages/admin/UserManagement.tsx`:

1. **Remove the implicit active-only filter** from the user list query so inactive users are returned by default.
2. **Add a Status filter dropdown** in the existing filter bar with three options:
   - **All** (default) — shows active + inactive
   - **Active only**
   - **Inactive only**
3. **Visual marker for inactive rows**:
   - Greyed-out / muted row styling (`opacity-60`)
   - Red "Inactive" badge next to the name (matching the green "Active" pill convention used elsewhere)
4. **Sort behavior**: Active users first, then inactive, both alphabetical — so the working roster stays at the top.
5. **Counts in tab/header**: Update the "Total Users" count to show `Active: X · Inactive: Y · Total: Z` for clarity.

### Why default to "All" and not "Active"

- Admin needs to *see* deactivated users to manage them (reactivate, audit, reassign).
- Hiding them by default is exactly what caused this confusion.
- The filter chip lets admins narrow down when they want a clean active-only view.

### Files Changed

| File | Change |
|---|---|
| `src/pages/admin/UserManagement.tsx` | Remove active-only filter; add Status dropdown (All/Active/Inactive); style inactive rows; update counts; sort active-first |
| `DOCUMENTATION.md` | v2.66.7.11 entry — inactive users now visible in admin list |
| `POLICY.md` | Note: User Management list shows all users by default; status filter governs view |
| `mem://features/user/employee-status-management` | Append: admin list shows inactive users (greyed + badge) so they're discoverable for reactivation |

### Risk & Impact Report

- **Data Impact**: None. Read-only query change — same select shape, just no `is_active` filter.
- **Workflow Impact**: Positive. Admins can now find and reactivate deactivated users without DB access.
- **UI/UX**: Inactive rows clearly differentiated (muted + red badge); default sort keeps active users on top so the working view is unchanged.
- **Regression Risk**: Very low. Existing edit/bulk/role flows already handle `is_active` correctly; only the list visibility changes.
- **Mitigation**: Status filter lets admins restore the old "active only" view in one click; row styling makes status unambiguous.

### Out of Scope

- Row-level activate/deactivate buttons (separate plan, previously declined).
- Changes to other lists/pickers (those use `is_active=true` intentionally for assignment contexts).


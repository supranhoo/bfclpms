# Fix: Data Entry Sidebar Gate (AppSidebar.tsx)

## Problem (Confirmed)

`src/components/layout/AppSidebar.tsx` line 314:

```ts
if (item.menuKey && canAccess(item.menuKey)) return isDataOwner || true;
```

The `|| true` short-circuits the `isDataOwner` check, making it dead code. Result: every non-admin role listed in `roles: ['employee', 'manager', 'auditor', 'management', 'hr_pms']` (line 108) sees the **Data Entry → Org KPI Data Entry** menu item, but `DataOwnerRoute` (`src/components/layout/DataOwnerRoute.tsx` line 13, wired in `App.tsx` line 213) immediately redirects non-owners to `/dashboard`. Broken UX: menu visible → click → bounce.

## Root Cause

A logic typo (`|| true`) bypassing the intended guard. The comment ("require isDataOwner OR have a user override") describes the correct intent.

## Fix

Replace the dead check so the menu shows only when the user can actually use the page:

- They are an org KPI data owner (`isDataOwner`), **OR**
- They have an explicit per-user override or profile-based grant for the `data-entry` menu key.

Note: `useMenuAccess.canAccess()` returns `true` for any role listed in the menu's `allowed_roles` (DB config or hardcoded fallback), which is exactly why the current short-circuit lets everyone in. We need a stricter signal that the user was *individually* granted access, independent of role-default. We'll source that from the same hook by checking `userOverrides` and `profileRights` directly (both already returned by the existing `useMenuAccess` query layer).

### Code change (single file)

**`src/components/layout/AppSidebar.tsx`** (~line 144 + 309–317)

1. Pull `userOverrides` and (optionally) `canPerform` out of `useMenuAccess()`:
   ```ts
   const { canAccess, userOverrides } = useMenuAccess();
   ```
   Also pull the current `user` from `useAuth()` (already imported via `useAuth()` — `user` field).

2. Replace the `filterByRole` for the Data Entry group:
   ```tsx
   filterByRole={(items) =>
     items.filter((item) => {
       if (!effectiveRole) return false;
       if (effectiveRole === 'admin') return false; // admins see it under Administration
       if (!item.menuKey) return false;

       const hasUserOverride = !!user && userOverrides.some(
         (o) => o.menu_key === item.menuKey && o.user_id === user.id
       );

       // Show only if user is a data owner OR has an explicit per-user override.
       // Role-default access is intentionally NOT sufficient here, because
       // DataOwnerRoute will redirect non-owners away.
       return Boolean(isDataOwner) || hasUserOverride;
     })
   }
   ```

3. Leave `DataOwnerRoute` and `useIsAnyOrgKpiDataOwner` unchanged — they remain the authoritative server-side guard.

## Risk & Impact Report

- **Data Impact**: None. UI-only filter change.
- **Workflow Impact**: Non-owner users (employee/manager/auditor/management/hr_pms) will no longer see the Data Entry sidebar item. This matches existing route behavior (they were already being redirected). True data owners and admins are unaffected.
- **UI/UX Consistency**: Eliminates the misleading menu → redirect loop. Sidebar now reflects reality.
- **Regression Risk**: Low. The change is scoped to one `filterByRole` callback. Admins keep their entry under Administration (line 87). Per-user overrides continue to work.
- **Mitigation**: Add a unit test (below) and verify both paths (owner shown, non-owner hidden, override-granted shown).

## SSOT / Documentation Sync

- `DOCUMENTATION.md` — bump version, add entry under Version History describing the fix.
- `POLICY.md` — under the menu access / data ownership section, add a one-liner: "Sidebar visibility for Data Entry mirrors `DataOwnerRoute`: data owners OR explicit per-user overrides only; role-default is insufficient."
- `mem/features/admin/menu-access-rights` — append note that Data Entry group is governed by ownership, not role defaults.

## Tests

Add to `src/test/bugBountyFixes.test.ts` (BUG-040):

- Assert the source of `AppSidebar.tsx` no longer contains `isDataOwner || true`.
- Assert it references both `isDataOwner` and `userOverrides` inside the Data Entry filter block.

(A behavioral RTL test for the sidebar would require mounting providers; the static guard above is the cheapest regression net consistent with the existing bugBountyFixes pattern.)

## Files Touched

- `src/components/layout/AppSidebar.tsx` (logic fix)
- `src/test/bugBountyFixes.test.ts` (regression test)
- `DOCUMENTATION.md`, `POLICY.md`, `mem/index.md`, `mem/features/admin/menu-access-rights` (SSOT sync)

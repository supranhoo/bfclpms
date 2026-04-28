# Fix: PMS Policy Menu Visibility Honors `pms_policy_visible_roles` (BUG-042)

## Problem (Confirmed)

The PMS Policy access chain has two competing sources of truth and the menu picks the wrong one:

| Layer | File / Source | Behavior |
|---|---|---|
| Page guard (canonical) | `src/pages/PMSPolicy.tsx` line 35 | Redirects to `/dashboard` when `role !== 'admin'` and `role` is not in `app_settings.pms_policy_visible_roles`. |
| Sidebar menu (broken) | `src/components/layout/AppSidebar.tsx` line 177–186 + `src/hooks/useMenuAccess.ts` line 47 | Uses `canAccess('pms-policy')`. `useMenuAccess` returns **true unconditionally for every signed-in user** because `'pms-policy'` is in `EMPLOYEE_DEFAULT_MENUS` (Layer 1, applied **before** any role/config check). The hardcoded fallback (Layer 7) also lists every role, and the DB row in `menu_access_config` (`allowed_roles = {admin,manager,employee,auditor,management,hr_pms}`) covers all roles too. |
| Static menu `roles` field (dead) | `AppSidebar.tsx` line 63 | `roles: [...new Set(['admin', ...policyVisibleRoles])]` — wired up dynamically but never consulted because `filterByRole` short-circuits to `canAccess(menuKey)` whenever `menuKey` exists. |

Net effect: an admin removes "Auditor" from PMS Policy visibility on the page UI; auditors still see "PMS Policy" in the sidebar; clicking it bounces them to `/dashboard`.

## Decision: Single Source of Truth

`app_settings.pms_policy_visible_roles` is canonical. It is the field the admin toggles from the PMS Policy page (line 39–45 with checkboxes). The page guard already uses it. The sidebar must use it too. The `menu_access_config` row for `pms-policy` and the `EMPLOYEE_DEFAULT_MENUS` entry are the bugs.

## Fix

Three coordinated edits in `src/hooks/useMenuAccess.ts` plus matching tests/docs:

### 1. Remove `'pms-policy'` from `EMPLOYEE_DEFAULT_MENUS`

```ts
// Before
const EMPLOYEE_DEFAULT_MENUS = ['dashboard', 'inbox', 'pms-policy'];
// After
const EMPLOYEE_DEFAULT_MENUS = ['dashboard', 'inbox'];
```

PMS Policy is not a universal default; it is a configurable, role-gated page.

### 2. Add a special-case branch in `canAccess` that defers to `pms_policy_visible_roles`

Inject `useAppSettings` into `useMenuAccess`. Inside `canAccess`:

```ts
// PMS Policy: canonical source is app_settings.pms_policy_visible_roles.
// Admin always sees it; everyone else only if their effective role is in the configured list.
if (menuKey === 'pms-policy') {
  if (effectiveRole === 'admin') return true;
  if (!effectiveRole) return false;
  const visible = appSettings?.pms_policy_visible_roles
    ?? ['admin', 'manager', 'employee', 'auditor', 'management', 'hr_pms'];
  return visible.includes(effectiveRole);
}
```

This branch runs **before** the EMPLOYEE_DEFAULT_MENUS / profile / override / role-default cascade, so it cannot be bypassed by Layer 1 or by stale DB rows.

Per-user overrides (`menu_access_user_overrides` row for `pms-policy`) intentionally still grant access — that's a deliberate admin escape hatch consistent with §111 design.

### 3. Remove `'pms-policy'` from the `DEFAULT_MENU_ROLES` hardcoded fallback

Otherwise Layer 7 would re-introduce the bug if `appSettings` is unavailable. Removing the entry forces the special-case branch to be the only authority.

### 4. (Optional cleanup) Drop the `roles:` derivation in `getStaticMenuItems`

`AppSidebar.tsx` line 63 currently weaves `policyVisibleRoles` into the menu item's `roles` array but it is dead code. Leave it as-is — it does no harm and serves as a hint. Will note this in the policy.

### 5. Page guard wait-for-loading hardening

`PMSPolicy.tsx` line 35 already gates on `!isLoading`, so it won't false-bounce. No change needed.

## Risk & Impact Report

- **Data Impact**: None. UI/policy alignment only. `app_settings.pms_policy_visible_roles` already exists and is the canonical column.
- **Workflow Impact**:
  - Admins: unchanged (always see PMS Policy).
  - Roles in `pms_policy_visible_roles`: unchanged (see and access).
  - Roles **not** in `pms_policy_visible_roles`: no longer see the menu item. Previously they saw it and got redirected.
  - Per-user overrides on `pms-policy` continue to grant access — same escape hatch as Data Entry.
- **UI/UX Consistency**: Eliminates the menu→redirect bounce for excluded roles. Sidebar matches page reality.
- **Regression Risk**: Low. `useMenuAccess` already returns `useAppSettings`-backed data elsewhere in the layout via `AppSidebar.tsx` line 143; we'll subscribe again from inside the hook. React Query dedupes the fetch, so no extra network cost.
- **Mitigation**: Regression test (BUG-042) below pins the special-case branch and the EMPLOYEE_DEFAULT_MENUS removal.

## SSOT / Documentation Sync

- `DOCUMENTATION.md` — `v2.66.7.44` Version History entry describing BUG-042 and the canonical source.
- `POLICY.md` — extend §111 (or add §112) with: "When a page has its own role-visibility config (e.g., `pms_policy_visible_roles`), `useMenuAccess.canAccess` MUST defer to that config in a dedicated branch. The menu key MUST NOT appear in `EMPLOYEE_DEFAULT_MENUS` or `MANAGER_DEFAULT_MENUS`, and the `DEFAULT_MENU_ROLES` fallback for that key MUST be removed."
- `mem://features/admin/pms-policy-management` — add a one-liner cross-referencing the canonical column.
- `mem://features/admin/menu-access-rights` — add a "config-backed pages" note pointing to PMS Policy as the precedent.

## Tests

Add to `src/test/bugBountyFixes.test.ts` (BUG-042):

- `useMenuAccess.ts` source no longer contains `'pms-policy'` inside `EMPLOYEE_DEFAULT_MENUS`.
- `useMenuAccess.ts` source contains a dedicated `if (menuKey === 'pms-policy')` branch that references `pms_policy_visible_roles`.
- `useMenuAccess.ts` source no longer lists `'pms-policy'` in `DEFAULT_MENU_ROLES`.
- (Optionally) `AppSidebar.tsx` still renders the item with `menuKey: 'pms-policy'` so the special-case branch is exercised.

## Files Touched

- `src/hooks/useMenuAccess.ts` (logic fix — three edits)
- `src/test/bugBountyFixes.test.ts` (BUG-042 regression test)
- `DOCUMENTATION.md`, `POLICY.md` (SSOT sync)
- `mem://features/admin/pms-policy-management`, `mem://features/admin/menu-access-rights` (cross-reference notes)

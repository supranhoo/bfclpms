---
name: Access-Profile / RLS alignment
description: SSOT for translating Access Profile menu rights into DB RLS via has_menu_right + universal silent-RLS guard
type: feature
---

## Rule

Access Profile menu rights only become real if RLS recognizes them. To avoid silent "Saved" toasts that did nothing:

1. **DB SSOT:** `public.has_menu_right(_user_id, _menu_key, _action)` — SECURITY DEFINER, STABLE, search_path=public. Used inside RLS policies.
2. **Frontend guard:** every admin-page mutation on a profile-protected table MUST append `.select('id')` and pipe through `assertRowsTouched(data, error, { menuKey, action, resource })` from `src/lib/db/assertRowsTouched.ts`. 0 rows → `PermissionError` toast, never a fake success.
3. **UI gating:** disable + tooltip Save/Assign/Remove buttons when `useMenuAccess.canPerform(menuKey, action)` is false.

## v1 delegated menus

- `admin-users / update` → `profiles` UPDATE
- `admin-access-profiles / add` → `access_profile_assignments` INSERT
- `admin-access-profiles / delete` → `access_profile_assignments` DELETE

## Always admin-only (do NOT delegate)

- `user_roles` (role changes — privilege escalation risk).
- `access_profile_menu_rights` (editing the rights table itself).
- `profiles` DELETE.

## Extending

Adding a new delegated menu requires (a) a new permissive RLS policy using `has_menu_right`, (b) wiring the mutation through `assertRowsTouched`, (c) explicit user approval before widening blast radius.

See ADR-079.
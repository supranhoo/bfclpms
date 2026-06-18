## Error

```
Failed to update user
duplicate key value violates unique constraint "user_roles_user_id_role_key"
```
Triggered from Admin → User Management → Edit User → Save Changes, for **Vivek Kumar Dansena (101784)**.

## Evidence (verified against DB)

`user_roles` rows for this user:

| user_id | role |
|---|---|
| ca38…2926 | `admin` |
| ca38…2926 | `platform_owner` |

The user has **two** rows in `user_roles`. The constraint `user_roles_user_id_role_key` is `UNIQUE (user_id, role)`.

## 5-Why

1. **Why did Save Changes fail?** Postgres rejected the write with a duplicate-key error on `(user_id, role)`.
2. **Why was a duplicate produced?** The Edit User mutation runs `UPDATE user_roles SET role = :newRole WHERE user_id = :userId`. With two existing rows, both get rewritten to the same role → collision on the unique key.
3. **Why does the code do a blanket UPDATE?** It was written assuming each user has exactly one row in `user_roles` (UI treats role as singular: `user_roles[0].role`).
4. **Why does this user have two rows?** `user_roles` schema permits multiple roles per user (it's a junction table), and `platform_owner` was granted in addition to `admin` (legitimate — platform/implementation roles can co-exist with functional roles).
5. **Why didn't this surface earlier?** Almost every employee has exactly one functional role, so the singular assumption held in practice. Multi-role users (platform_owner / implementation_admin layered on top of admin) are rare and only break on edit.

## Root Cause

Mismatch between **data model** (many roles per user) and **write path** (assumes one row, uses blanket `UPDATE`). The same bug exists in:

- `src/pages/admin/UserManagement.tsx` → `updateUser` mutation (line ~664)
- `src/pages/admin/UserManagement.tsx` → `bulkUpdateUsers` mutation (line ~859)
- `src/pages/admin/UserManagement.tsx` → `createUser` post-create role update (line ~734)

The Edit User dialog also silently hides the second role — admin sees "admin" only, has no idea `platform_owner` exists, and any save will either fail (current) or wipe the second role (after naive fix). Both outcomes are wrong.

## Risk & Impact

- **Data**: Naive fix (delete-all + insert-one) would silently strip `platform_owner` / `implementation_admin` from layered users — a privilege change disguised as a profile edit. **Must not do that.**
- **Workflow**: Admins currently cannot save any edits (even non-role edits like mobile number) for multi-role users, because the role UPDATE runs unconditionally.
- **UI**: One field, multiple underlying rows — needs disclosure.
- **Regression**: Low if we (a) skip the role write when role is unchanged, (b) preserve non-functional roles (`platform_owner`, `implementation_admin`) on functional-role swaps.
- **Scope**: 3 call sites in one file; ~12 multi-role users in DB (will verify before rollout).

## CAPA — Plan

### Corrective (fix the bug now)

1. **`updateUser` mutation** — change role write to:
   - Read existing roles for `user_id`.
   - If selected `editRole` already exists in the set → **no-op** (skip the role UPDATE entirely; still run the profile UPDATE).
   - Else: in one batch — delete only the **functional** role rows (`admin`, `manager`, `employee`, `auditor`, `management`, `hr_pms`, `skip_level`) for this user, then insert the new functional role. **Preserve** `platform_owner` and `implementation_admin` rows untouched.
   - Wrap as a small `updateUserFunctionalRole(userId, newRole)` helper in `src/lib/userRoles.ts` so all three call sites share one implementation.

2. **`bulkUpdateUsers`** — call the same helper per user inside the loop.

3. **`createUser`** — same helper; new users only have `employee` so it collapses to a single update, but the helper handles it idempotently.

4. **Edit User dialog (UI disclosure)** — under the role select, when the user has additional non-functional roles, show a small read-only chip row: "Also has: platform_owner". Pure rendering, no logic change.

### Preventive

5. **Unit tests** (`src/test/admin/userRoleUpdate.test.ts`):
   - User with single role → role swap works.
   - User with `admin` + `platform_owner`, edit role to `admin` (unchanged) → no DB write, no error.
   - User with `admin` + `platform_owner`, swap functional role to `manager` → `manager` row exists, `platform_owner` row preserved, no duplicate-key error.
   - Mock data updated to include a multi-role profile.

6. **DB-side guard** — add a SECURITY DEFINER RPC `public.set_functional_role(p_user_id uuid, p_new_role app_role)` that encapsulates the delete-functional + insert logic atomically, so future call sites cannot reintroduce the bug. The hooks call the RPC; the raw `update` on `user_roles` from the client is removed.

### Documentation & Policy

7. **DOCUMENTATION.md** — new entry under "User Management → Role Edits": clarify that functional and platform roles are independent layers and that Edit User only manages the functional role.
8. **POLICY.md** — add governance rule: "Functional role edits MUST NOT mutate `platform_owner` or `implementation_admin` assignments. Platform-tier roles are granted/revoked only via the Identity & Access Console."

### Rollback

All changes are additive (new RPC + helper). To revert: drop the RPC and restore the previous `UPDATE user_roles…` call site. No destructive schema changes.

## Technical Summary

| File | Change |
|---|---|
| `supabase/migrations/<ts>_set_functional_role.sql` | New RPC `set_functional_role(uuid, app_role)`; admin-only; deletes functional-role rows for user, inserts new one in one statement; audit log entry. |
| `src/lib/userRoles.ts` (new) | `setFunctionalRole(userId, role)` wrapper around the RPC. |
| `src/pages/admin/UserManagement.tsx` | Replace 3 inline `user_roles` writes with helper; add "Also has: …" chip row in Edit dialog. |
| `src/test/admin/userRoleUpdate.test.ts` (new) | 3 scenarios above. |
| `DOCUMENTATION.md`, `POLICY.md` | Versioned entry as above. |

## Out of scope

- Multi-functional-role assignment UI (not requested; today's UI is single-select).
- Backfill / cleanup of any existing duplicates (DB already has the unique constraint — no duplicates possible).

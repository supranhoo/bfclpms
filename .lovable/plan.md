## Problem

Editing **Tarkeshwar Kumar (100597)**'s email in User Management fails with toast **"Failed to update email — User not found"**. The edge function `update-user-email` calls `auth.admin.updateUserById(...)`, which raises "User not found" because the employee has a `profiles` row but no `auth.users` row yet (non-login user provisioned via master backfill).

This is the exact "profile-without-auth" state already documented in `mem/features/admin/non-login-user-provisioning` and BUG-044. The Password Rollout edge function handles it; `update-user-email` does not.

## Root Cause

`supabase/functions/update-user-email/index.ts` blindly calls `updateUserById` with no probe / create-if-missing branch. As soon as the target employee has never had a login provisioned, the call fails and the entire edit is aborted (the rest of the profile fields don't save either, because `handleSaveUser` returns on email failure).

Verified directly:
- `profiles.id = 379ddb35-…-c29be654adb4`, `email IS NULL`, `employee_code = 100597`
- No matching row in `auth.users`

## Fix — Apply the canonical Non-Login User pattern (POLICY §113)

### 1. `supabase/functions/update-user-email/index.ts`

Mirror `password-rollout`:

1. Load the target `profiles` row (`id`, `full_name`, `employee_code`) for metadata.
2. `getUserById(userId)`:
   - **Missing** → `auth.admin.createUser({ id: userId, email: newEmail, email_confirm: true, user_metadata: { full_name, employee_code } })`. Reuse the profile id verbatim so all FKs keyed on it stay intact.
   - **Present** → existing `auth.admin.updateUserById(userId, { email: newEmail, email_confirm: true })`.
3. Sync `profiles.email = newEmail` (existing step).
4. Return `{ success: true, auth_action: 'created' | 'updated' }` so the UI can distinguish first-time provisioning from a normal email change.
5. Friendlier validation error if the target email already belongs to another auth user (`AuthApiError: email_exists` → 409 with clear message).

### 2. `src/pages/admin/UserManagement.tsx`

- When `auth_action === 'created'`, show toast: **"Login provisioned — user can now sign in once a password is set."** (Password Rollout remains the canonical password path.)
- Existing failure toast preserved.
- No change to the rest of `handleSaveUser`.

### 3. Documentation

- Update `mem/features/admin/non-login-user-provisioning` to add `update-user-email` to the list of admin tools that follow the canonical pattern.
- New ADR-063 documenting the bug, the fix, and the rule that **every** admin edge function mutating `auth.users` for a profile id MUST probe-then-branch.
- Append POLICY §113 with `update-user-email` reference.

## Risk & Impact

- **Data Impact**: none — uses existing profile id; no orphaned FKs.
- **Workflow Impact**: admins can now set/change email for backfilled employees without bouncing through Password Rollout first.
- **Security**: edge function still gated by `requireAdminUser`; new `createUser` path uses `email_confirm: true` so no verification email is sent (matches existing update behaviour).
- **Regression Risk**: low — the existing "auth user already exists" path is unchanged.
- **Mitigation**: explicit unit-style assertion in the function (`if (!getErr && existing?.user) update; else create;`) plus a new test that mocks both branches.

## Files Touched

- `supabase/functions/update-user-email/index.ts`
- `src/pages/admin/UserManagement.tsx` (toast copy only)
- `mem/features/admin/non-login-user-provisioning`
- `docs/adr/ADR-063.md` (new)

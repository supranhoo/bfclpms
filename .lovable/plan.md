## Root Cause Found

The previous fix reached the next blocker, but did not cover the database trigger side-effect.

Current failure from the live request:

```text
password-rollout response:
0 of 1 succeeded
error_message: Auth provisioning failed: Database error creating new user
```

For Binod Kumar Bhanja (`201142`):
- `profiles` row exists.
- `auth.users` row does not exist.
- `user_roles` row also does not exist.

The password-rollout function now correctly tries `auth.admin.createUser({ id: profile.id, ... })`, but the existing `handle_new_user()` database trigger runs after auth user creation and blindly does:

```sql
INSERT INTO public.profiles (id, email, full_name) VALUES (...);
INSERT INTO public.user_roles (user_id, role) VALUES (..., 'employee');
```

Because the profile already exists for backfilled employees, the trigger raises a duplicate-profile error inside the auth transaction. Lovable Cloud reports that as the generic auth error: `Database error creating new user`.

## Risk & Impact Report

**Data Impact**
- Requires a database function migration only; no existing employee/KRA/history data will be changed.
- Existing profile rows remain intact.
- Future auth user creation for backfilled employees will become idempotent.

**Workflow Impact**
- Password rollout will become the canonical first-login provisioning path as intended.
- Normal self-signup/auth creation remains supported: if no profile exists, the trigger still creates one.
- Missing role rows for backfilled employees will be safely inserted as employee defaults when needed.

**UI/UX Consistency**
- No layout changes required.
- I will improve the error surfaced in the password rollout response so admins see an actionable message instead of only `Database error creating new user`.

**Regression Risk**
- Low, but auth triggers are sensitive. The risk is accidentally overwriting backfilled HR profile data or duplicating roles.

**Mitigation Plan**
- Use `ON CONFLICT DO NOTHING`, not update, for the existing profile. This preserves imported employee master data.
- Use `ON CONFLICT (user_id, role) DO NOTHING` for role assignment.
- Add regression tests that pin the trigger idempotency pattern and the rollout error handling.

## Implementation Plan

1. **Make `handle_new_user()` idempotent**
   - Add a new migration replacing the function body:
     - Insert into `public.profiles` only if the profile id does not already exist.
     - Insert default `employee` role only if that `(user_id, role)` does not already exist.
   - Do not alter the `auth.users` table directly.
   - Do not overwrite existing profile fields such as employee code, department, designation, reporting manager, company, or active state.

2. **Harden `password-rollout` for this specific failure**
   - Keep the existing probe → create/update flow.
   - Improve the create-user error mapping for the generic auth database error so the log explains the likely root cause if provisioning still fails.
   - Keep `id: profile.id` and `email_confirm: true` intact.

3. **Improve rollout history/debug visibility**
   - Store/surface the improved error message in `password_rollout_logs.error_message`.
   - Keep the UI lean; no schema change is required unless we decide to persist `auth_action` later.

4. **Regression protection**
   - Extend `src/test/bugBountyFixes.test.ts` with BUG-045 coverage:
     - `handle_new_user()` uses conflict-safe profile insertion.
     - `handle_new_user()` uses conflict-safe default-role insertion.
     - `password-rollout` still creates auth users using the profile id, not a fresh id.

5. **Documentation and policy sync**
   - Update `POLICY.md` with a new addendum: auth-created profile triggers must be idempotent for backfilled/non-login employees.
   - Update `DOCUMENTATION.md` version history with the RCA and fix.
   - Update `mem/features/admin/non-login-user-provisioning` to include the trigger requirement.

## Expected Result After Fix

Retrying **Generate & Send** for Binod Kumar Bhanja should:

```text
1 of 1 passwords generated successfully
```

The system will create the missing login account with the same UUID as the existing profile, preserve the employee’s KRA/reporting relationships, assign the default employee role if missing, then send credentials by email.
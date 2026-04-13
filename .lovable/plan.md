
## RCA

- The screenshot is from `/admin/users` → **Reset Password** → **Set New Password**.
- The earlier fix was for **`password-rollout`**, not this **`reset-password`** flow.
- Confirmed in code:
  - `src/pages/admin/UserManagement.tsx` still calls `supabase.functions.invoke('reset-password')` for both:
    - Generate Reset Link
    - Set New Password
  - `supabase/functions/reset-password/index.ts` still uses the older `supabaseAdmin.auth.getUser(token)` auth pattern.
  - `supabase/config.toml` still has `[functions.reset-password] verify_jwt = true`, which is inconsistent with the project’s admin-edge standard.

Do I know what the issue is? Yes.

The feature is still failing because this is a separate admin auth path that was never migrated to the project-standard pattern. So the previous fix worked for `password-rollout`, but `/admin/users` password reset is still using the old client invocation and old edge-function auth logic.

## Risk & Impact Report

- **Data impact:** None. No schema or RLS changes needed.
- **Workflow impact:** Restores admin password reset actions only.
- **UI/UX impact:** No layout changes; only removes the failing error state.
- **Regression risk:** Medium, because `/admin/users` contains other admin edge calls with similar patterns.
- **Mitigation:** Keep request/response contracts unchanged, add targeted tests, and audit sibling admin actions on the same page for the same auth anti-pattern.

## Fix Plan

1. **Update the client call in `src/pages/admin/UserManagement.tsx`**
   - Replace both `supabase.functions.invoke('reset-password')` usages with `invokeAdminEdgeFunction()`.
   - Keep the same payloads:
     - `{ email, action: 'generate_link' }`
     - `{ email, newPassword, action: 'set_password' }`

2. **Refactor `supabase/functions/reset-password/index.ts`**
   - Replace the inline token validation with the shared `requireAdminUser(req)` helper.
   - Use the returned `auth.user` and `auth.adminClient` instead of validating with the service-role client directly.
   - Preserve existing validation, link generation, and password update behavior.

3. **Align edge-function config**
   - Update `supabase/config.toml` so `[functions.reset-password] verify_jwt = false`.
   - This makes the function consistent with the project’s standard “validate JWT in code” admin model.

4. **Regression hardening**
   - Audit the other admin edge calls used from `/admin/users` (especially `update-user-email`) for the same outdated invoke/auth combination.
   - If they use the same pattern, align them in the same pass to avoid the next identical bug.

5. **Tests and mock coverage**
   - Extend client-side tests to verify reset-password admin calls forward `Authorization` and `apikey` explicitly.
   - Add edge-function auth tests for:
     - missing/invalid token
     - non-admin user
     - valid admin request
   - Add minimal mock request/response fixtures for:
     - generate reset link
     - set new password

6. **Documentation sync**
   - Update `DOCUMENTATION.md` with the RCA and the reset-password fix.
   - Update `POLICY.md` so admin password reset is explicitly covered by the admin edge-function invocation standard.

## Expected Result

- **Generate Reset Link** works again.
- **Set New Password** works again.
- The 401 / “Invalid token” / non-2xx error disappears for authenticated admins.
- The admin password reset flow becomes consistent with the already-fixed `password-rollout` pattern and is protected by tests.

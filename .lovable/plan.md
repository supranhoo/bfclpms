## Finding

User **101966 / Vedant Pawar** already has an active IAC role:

- `safety_admin` in `iac_user_role_assignments`
- Global Safety module is enabled
- `has_any_safety_role(...)` returns `true`
- But the Hub and `/safety` route still call `has_safety_module_access(...)`, and that function currently checks only:
  - `safety_module_access`, or
  - legacy `safety_user_roles`

So this is not a user assignment issue. It is an access-gate mismatch: the new bulk grant writes to IAC, but the Safety tile gate still ignores IAC roles.

## Risk & Impact Report

- **Data Impact:** No historical user data needs to be changed. Existing IAC Safety assignments will immediately become effective after the function is corrected.
- **Workflow Impact:** Users granted Safety roles through Bulk Grant Access will correctly see the Safety module. Legacy Safety grants remain supported.
- **UI/UX Consistency:** The Hub tile and `/safety` route will behave consistently with the IAC access model.
- **Regression Risk:** Low, but Safety visibility is security-sensitive. The fix must stay fail-closed and only allow active, non-expired Safety IAC roles.
- **Mitigation Plan:** Update the DB function centrally, add/adjust tests around Safety role visibility, and update documentation/policy notes so future grants use the same access source.

## Plan

1. **Fix the backend access gate**
   - Update `public.has_safety_module_access(_user_id uuid)` so it grants access when any of these are true:
     - active row in `safety_module_access` with `can_view = true`
     - legacy row in `safety_user_roles`
     - active, non-expired IAC role where `iac_roles.module = 'safety'`
   - Keep the function `SECURITY DEFINER` and fail-closed semantics.

2. **Refresh Hub visibility immediately after IAC changes**
   - Update `useModules` to also listen for realtime changes on `iac_user_role_assignments` for the current user.
   - This prevents users from needing to reload or wait for cache expiry after a bulk grant.

3. **Add regression coverage**
   - Add a test that documents the expected behavior: an active IAC Safety role is enough to unlock Safety visibility.
   - Keep legacy Safety grants covered so older role assignments continue working.

4. **Update SSOT documentation**
   - Update `DOCUMENTATION.md` / policy notes to state that Safety module visibility is now controlled by the unified IAC role model plus legacy Safety grants.
   - Add a version history entry for the access-gate alignment.

## Expected Result

After implementation, **101966 will see Safety** because his existing `safety_admin` IAC assignment will be recognized by the same function used by the Hub and route guard.
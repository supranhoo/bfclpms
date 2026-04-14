

## Fix: "Remember Me" Should Prefill Email and Enable Password Autofill After Inactivity Logout

### Root Cause

Two issues prevent the expected behavior:

1. **No email persistence**: When the idle timeout triggers `signOut()`, the user's email is lost. The Auth page initializes `loginEmail` as an empty string with no attempt to restore a saved value.

2. **Missing HTML attributes for browser autofill**: The login form inputs lack `name` and `autoComplete` attributes. Without these, browsers and password managers cannot identify the fields to offer saved credential suggestions.

### Implementation

**1. `src/pages/Auth.tsx`**
- Add `name="email"` and `autoComplete="email"` to the email input
- Add `name="password"` and `autoComplete="current-password"` to the password input
- On mount, read `pms_remembered_email` from `localStorage` and prefill the email field
- Initialize `rememberMe` from `localStorage` based on existing `pms_remember_me` flag

**2. `src/hooks/useIdleTimeout.ts`**
- Before calling `signOut()`, save the current user's email to `localStorage` as `pms_remembered_email` (read from the Supabase session)

**3. `src/contexts/AuthContext.tsx`**
- In the `signIn` method, when `rememberMe` is true, also save the email to `pms_remembered_email`
- In the `signOut` method, do NOT clear `pms_remembered_email` (so it survives manual logout too)
- In `beforeunload`, when remember-me is false, also clear `pms_remembered_email`

**4. `DOCUMENTATION.md` / `POLICY.md`** — Version bump, changelog entry.

### Risk Assessment
- **Data impact**: None — only localStorage keys, no DB changes
- **Regression risk**: Low — adds HTML attributes and reads a localStorage key
- **Security**: Email stored in localStorage (not password). Browser autofill handles password securely via its own credential store
- **UI/UX**: No visual changes; email field will be pre-populated when returning after logout


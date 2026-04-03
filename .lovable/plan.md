
## RCA: Why the page stays on skeleton forever

The current issue is on the dashboard, not the auth form.

### Exact root cause
The user is successfully authenticated, but `profile` is ending up `null` after auth bootstrap. Two code paths create a dead-end state:

1. `AuthContext.fetchProfile()` uses `.single()` on `profiles`
   - if no profile row exists, or the query fails, it throws
   - the catch block shows a toast but returns `true`, so auth loading finishes anyway

2. `src/pages/Dashboard.tsx` does:
   - `if (!profile) return <DashboardSkeleton />;`
   - so once loading is done with `profile === null`, the dashboard shows skeleton forever

This matches the screenshot:
- user is inside `/dashboard`
- sidebar renders with fallback `"User"`
- main dashboard never exits skeleton state

### Likely underlying data issue
At least one authenticated user likely has an incomplete account record:
- missing `profiles` row and/or
- missing `user_roles` row

So there are two problems:
- UI resilience bug: null profile becomes infinite skeleton
- data integrity bug: some users may be missing required identity rows

## Risk & Impact Report

- **Data impact:** likely requires a safe backfill for missing profile/role rows; no destructive changes
- **Workflow impact:** affected users currently cannot use the dashboard after login
- **UI/UX impact:** login succeeds but app appears hung, which is misleading
- **Regression risk:** medium if auth bootstrap logic is changed carelessly
- **Mitigation:** keep auth/session flow intact, add explicit “profile missing / account setup incomplete” handling, and add regression tests

## Implementation plan

### 1. Harden auth bootstrap in `AuthContext`
Update `src/contexts/AuthContext.tsx` so auth bootstrap distinguishes:
- session restored
- profile loaded
- role loaded
- failure/incomplete-account state

Planned changes:
- replace risky `.single()` calls with `.maybeSingle()` where zero rows are possible
- stop treating profile-fetch failure as success
- add an explicit status/result from `loadUserData()` instead of only returning `true/false`
- if profile is missing, set a dedicated error/incomplete state instead of leaving `profile` null silently

### 2. Prevent infinite skeletons on dashboard
Update `src/pages/Dashboard.tsx` so `!profile` does **not** mean “keep loading forever”.

Instead:
- show skeleton only while auth bootstrap is actually loading
- if auth finished but profile is missing, render an actionable error state:
  - “Account setup incomplete” / “Unable to load your profile”
  - retry button and sign-out button
- do the same for any other top-level route that assumes profile must exist

### 3. Keep sidebar/layout safe when profile is missing
Update layout-level consumers (`DashboardLayout` / sidebar surface if needed) so they can handle:
- authenticated user + missing profile
without masking the problem as normal loading

### 4. Repair existing broken user records
Add a backend migration to backfill identity data for existing users:
- create missing `profiles` rows from existing authenticated users
- create missing default `user_roles` rows where absent
- preserve existing rows and avoid duplicates

This fixes the real data mismatch for already-affected users.

### 5. Add regression tests and mock scenarios
Add tests for:
- authenticated user with missing profile row
- authenticated user with missing role row
- profile fetch error
- dashboard must render an error/recovery state, not endless skeleton

Also add mock data/fixtures for incomplete-account scenarios, per project policy.

### 6. Documentation and policy sync
Update:
- `DOCUMENTATION.md` with RCA + patch note
- `POLICY.md` with an invariant that authenticated entry screens must never remain in an indefinite skeleton when required identity records are missing; they must fail visibly and recoverably

## Files likely to change

- `src/contexts/AuthContext.tsx`
- `src/pages/Dashboard.tsx`
- `src/components/layout/DashboardLayout.tsx` (if needed)
- new auth/dashboard regression test files
- new backend migration for profile/role backfill
- `DOCUMENTATION.md`
- `POLICY.md`

## Expected outcome
After this fix:
- users with valid profile data will load dashboard normally
- users with broken/missing identity data will see a clear recovery/error state, not a permanent skeleton
- existing bad records will be repaired so affected accounts start working again

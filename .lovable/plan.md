
RCA + CAPA: 401 Unauthorized on Data Repair Edge Functions

1. Problem statement
The Data Repair screen is correctly calling the repair functions, but both repair endpoints can fail immediately with:
- `401 Unauthorized`
- response body: `{"error":"Unauthorized"}`

This happens before any repair logic runs.

2. Evidence collected
- The UI is sending a valid authenticated request. I confirmed the browser request includes:
  - `Authorization: Bearer <user JWT>`
  - `apikey`
  - JSON body `{ "mode": "scan", "limit": 1500 }`
- So this is not a frontend/session-forwarding issue.
- Both affected functions share the same inline auth block:
  - `supabase/functions/repair-orphaned-propagations/index.ts`
  - `supabase/functions/repair-stepped-back-siblings/index.ts`
- In both files, the 401 is returned before the admin role lookup, which means the failure is in token validation, not in admin-role authorization.
- These two functions are the outliers: they use `authClient.auth.getClaims(token)` while most other working admin functions in this project use the established “user-context client + admin client” pattern.

3. Root cause
Primary root cause:
- The repair functions use a brittle JWT-validation approach (`getClaims(token)` on a separately-created anon client) instead of the project’s stable serverless auth pattern.

Contributing causes:
- The auth logic is duplicated inline in multiple functions, so the same defect was copied into both repair tools.
- There are no regression tests covering admin-auth success/failure for these repair endpoints.
- Error responses are too generic (`Unauthorized` only), which made the previous fixes guesswork instead of evidence-driven debugging.

4. Why this is the actual issue
- The frontend is already passing the bearer token correctly.
- If the problem were missing admin role, the response would be `403 Admin only`, not `401 Unauthorized`.
- Since the 401 happens before role lookup, the failing step is identity validation.
- The current repair auth block differs from the project’s working admin-function pattern, which is the strongest code-level indicator of the regression.

5. Risk & Impact Report
- Data impact: No schema changes required. No historical data mutation needed for the auth fix itself.
- Workflow impact: Admin Data Repair becomes usable again; no workflow rule changes.
- UI/UX consistency: No visible UI redesign required, only clearer error handling.
- Regression risk: Medium, because both repair tools share copied auth logic and similar bugs can recur in future edge functions.
- Mitigation: Replace duplicated auth code with a shared helper, add auth regression tests, and add structured logs around auth failure reasons.

6. Corrective Action Plan
A. Standardize edge auth for both repair functions
- Replace the current inline `getClaims(token)` flow with the project-safe two-client pattern:
  - `userClient` = anon key + incoming `Authorization` header
  - `adminClient` = service role key
- Authenticate caller with `userClient.auth.getUser()` (or the project-approved shared helper built on this pattern).
- After identity is resolved, authorize via admin role lookup using `adminClient`.

B. Add a shared auth helper
- Create or extend a shared helper in `supabase/functions/_shared/` such as:
  - `requireAdminUser(req)`
- Responsibilities:
  - validate bearer header
  - resolve caller identity
  - verify admin role
  - return typed result or standardized error response
- Then use it in both repair functions to eliminate copy-paste auth drift.

C. Improve diagnostics
- Add structured logs for each auth stage:
  - missing header
  - user validation failed
  - user resolved but role missing
- Keep external error messages safe, but log precise failure reason internally.

D. Harden the frontend error handling
- Keep current invoke flow, but map known statuses:
  - 401 → “Your session is not authorized for this repair action.”
  - 403 → “Admin access is required.”
- This is secondary; root fix stays in the functions.

7. Preventive Action Plan
- Add Deno tests for both repair functions:
  1. missing auth header → 401
  2. invalid token/user not resolved → 401
  3. valid non-admin user → 403
  4. valid admin user, scan mode → 200
- Add shared auth-helper tests so future admin functions reuse the same verified logic.
- Update documentation/engineering notes so new admin edge functions must use the shared helper instead of custom inline auth.

8. Files to update
- `supabase/functions/repair-orphaned-propagations/index.ts`
- `supabase/functions/repair-stepped-back-siblings/index.ts`
- `supabase/functions/_shared/...` (new or existing shared auth helper)
- `DOCUMENTATION.md`
- `POLICY.md`
- new test files for both repair functions and the shared auth helper

9. Test coverage to add
- Auth success/failure tests for both repair endpoints
- Regression test proving an authenticated admin request reaches scan logic
- Regression test proving a non-admin request fails with 403, not 401
- Mock fixtures for:
  - admin user
  - non-admin user
  - bearer-token request shape used by `supabase.functions.invoke()`

10. Expected outcome
After implementation:
- Scan/Repair requests from System Settings → Data Repair will stop failing at the auth gate for valid admin users.
- Non-admins will receive the correct 403 response.
- Future admin repair tools can reuse the same helper, preventing repeat 401 regressions.

11. CAPA summary
- Cause: Repair functions use a fragile, duplicated token-validation pattern.
- Corrective Action: Replace with shared two-client admin auth helper and update both repair functions.
- Preventive Action: Add regression tests, structured auth logging, and documentation standards for all admin edge functions.

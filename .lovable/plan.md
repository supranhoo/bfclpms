## 1. Assumptions
- The screenshot/error is from `/safety/incidents/new` while submitting a new safety incident with at least one evidence file.
- The user is authenticated as Vedant Pawar (`b1110516-...`), and the submitted payload includes the same `reporter_id`.
- No code will be changed in this step; this is RCA only.

## 2. Clarifications
Not Applicable.

## 3. Risk & Impact Report
- **Data Impact:** No data was inserted for the failed submissions. Existing incident data is not affected.
- **Workflow Impact:** New incident reporting is blocked for at least this authenticated employee, so EHS reporting is operationally blocked.
- **UI/UX Impact:** The form appears valid, but the user receives a backend RLS error toast. This is confusing because the route allows the user to report incidents.
- **Regression Risk:** High. The previous fix changed the policy/function text, but the live insert path still fails.
- **Scalability Impact:** Not a volume/query-load issue. The failure occurs on a single-row insert before any large dataset behavior.
- **Mitigation Plan:** Verify the live DB object state, not only migration files; add regression coverage that checks trigger binding and real access invariants, not just SQL text.

## 4. Step-by-step Plan
### RCA Evidence Collected
1. Browser console confirms `42501`: `new row violates row-level security policy for table "safety_incidents"`.
2. Network trace confirms:
   - User is authenticated.
   - `reporter_id` in payload equals authenticated user id.
   - Pre-insert idempotency lookup returns `[]`.
   - POST to `safety_incidents` returns 403 / RLS violation.
3. Live DB policy exists and looks correct:
   - Policy: `Authenticated users can report incidents`
   - Operation: insert
   - Role: authenticated
   - Check: `auth.uid() IS NOT NULL AND reporter_id = auth.uid()`
4. Table privileges are present:
   - authenticated has insert/select on `public.safety_incidents`.
5. The user profile exists and is active.
6. Live trigger function body has the intended logic:
   - `v_auth_user := auth.uid()`
   - `NEW.reporter_id := v_auth_user`
   - then incident number/SLA defaults.
7. The trigger is attached to `public.safety_incidents`.

### 5-Why Analysis
**Problem:** Authenticated employee still cannot submit a safety incident; insert fails with RLS.

1. **Why did the user see the error?**  
   Because the database rejected the `safety_incidents` insert under Row Level Security.

2. **Why did RLS reject it if the user was authenticated?**  
   The insert row did not satisfy at least one active insert visibility/check condition at execution time.

3. **Why is that surprising?**  
   The live insert policy only requires `auth.uid()` to be non-null and `reporter_id = auth.uid()`, and the captured request payload does include the matching user id.

4. **Why did the previous fixes not resolve it?**  
   They verified the migration text and function text, but the regression test did **not** validate the actual runtime insert behavior or all DB objects involved in the insert. The earlier test was therefore a static SQL test, not an end-to-end DB access test.

5. **Why can the same error still happen after policy/trigger changes?**  
   The most likely remaining cause is that another insert-time database condition is being surfaced by PostgREST as an RLS violation, or the trigger/policy execution context differs from the assumed SQL text path. Specifically, the current evidence rules out the original two suspected causes — missing authenticated grant and mismatched client `reporter_id` — so the next fix must test the actual insert path directly and inspect all insert-time dependencies.

### RCA Conclusion
The earlier fixes were directionally correct but incomplete. The confirmed current root cause is **not**:
- missing login,
- missing table grant,
- missing user profile,
- absent insert policy,
- client sending a wrong `reporter_id`, or
- missing trigger attachment.

The actual remaining failure is a **runtime database enforcement mismatch**: static SQL definitions say the insert should pass, but the live API insert still fails. This means the next implementation should stop relying on text-based migration assertions and introduce a direct database-level submission pathway/test that proves authenticated incident creation works at runtime.

## 5. UI Changes
Not Applicable for RCA. The UI form is not the primary cause; the captured payload is valid.

## 6. Implementation
Not Applicable in this RCA step.

If approved, the fix plan is:
1. Add a narrow diagnostic migration/test helper or RPC-style submission path that stamps `reporter_id` server-side and performs the incident insert in one controlled backend function.
2. Keep the public table insert policy restrictive enough to prevent impersonation.
3. Update `submitSafetyIncident()` to call the controlled incident-reporting backend function instead of inserting directly into `safety_incidents` from the browser.
4. Preserve `client_submission_id` idempotency and existing evidence upload flow.

## 7. Tests
Current test gap: `incidentReportRlsPolicy.test.ts` only verifies migration SQL text. It does not prove the live insert works.

Needed tests:
- New regression that locks the approved incident-reporting entrypoint.
- Test that `reporter_id` is server-derived, not client-trusted.
- Test that unauthenticated submission remains blocked.
- Test that idempotency by `(reporter_id, client_submission_id)` remains intact.

## 8. DOCUMENTATION.md updates
Not Applicable for RCA-only. If implementation proceeds, document this as a follow-up RCA because it changes the incident submission architecture.

## 9. POLICY.md updates
Not Applicable for RCA-only. If implementation proceeds, add a policy note: incident reports must be created through the server-authoritative submission entrypoint, not by trusting browser-supplied identity.

## 10. Post-implementation notes
Recommended next action: implement a server-authoritative incident submission RPC/back-end entrypoint and update the app to use it, because the direct browser table insert remains fragile despite the visible policy looking correct.

Rollback strategy for the proposed implementation: revert the frontend to direct insert and drop only the new submission entrypoint; no existing incident records would need migration.
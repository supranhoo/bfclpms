## 1. Assumptions
- The active cycle remains **Annual Review 2025–2026**.
- “Total Active Reviews” should preserve the existing definition: every instance in the active cycle, including administratively excluded rows unless the current policy explicitly says otherwise.
- No review data should be rewritten; this is an access-policy and read-path repair.

## 2. Clarifications
Not Applicable. The live reproduction and database state identify the failure conclusively.

## 3. RCA and 5-Why Analysis
### Confirmed facts
- The active cycle exists and contains **2,580** instances: 31 pending self, 12 pending department, 279 pending BU, 17 pending management, 1,767 completed, and 474 excluded.
- The browser successfully loads the active cycle, but every request to `annual_review_instances` returns **HTTP 403**.
- The authenticated preview user has the Admin role.

### Root cause
ADR-162 added `EXISTS (SELECT 1 FROM auth.users …)` directly inside the `annual_review_instances` RLS policy. Authenticated application roles cannot query the protected `auth` schema. PostgreSQL may evaluate this branch even when the earlier Admin branch is true, so the entire SELECT fails with `permission denied for schema auth`. The prior auth-readiness fix could not resolve a deterministic database authorization failure.

### 5 Whys
1. Why are all dashboard cards zero? The instance count and page queries fail with 403, while the UI falls back to zero/empty data.
2. Why do the queries fail? The SELECT policy evaluates a subquery against `auth.users`.
3. Why is that forbidden? Application roles intentionally have no direct access to the protected auth schema.
4. Why did Admin access not bypass it? SQL policy expressions do not guarantee short-circuit evaluation of `OR` branches.
5. Why did the UI look like valid empty data? The Progress tab supplies zero defaults and does not render the query errors.

A secondary correctness gap is also confirmed: the count service does not enumerate the newer `pending_dept`, `pending_management`, or `excluded` statuses, so “In Progress” remains incomplete even after access is restored.

## 4. Risk & Impact Report
- **Data impact:** No row mutation or historical-score change. Add a narrowly scoped SECURITY DEFINER boolean helper and replace affected SELECT policy branches.
- **Workflow impact:** Read visibility only; submission and reviewer transitions remain unchanged.
- **UI/UX impact:** Real counts and rows return. Query failures will show an explicit retryable error instead of misleading zeros.
- **Security impact:** Preserve the “platform-login employees only” rule without granting application roles access to `auth.users`. The helper exposes only a boolean and uses a fixed `search_path`.
- **Regression risk:** Moderate because the affected instance/response policies are shared by employee, reviewer, hierarchy, and admin views.
- **Scalability:** Add a primary-key existence check per relevant completed row; `auth.users.id` is indexed. Existing server-side pagination remains capped at 100 rows.
- **Backup:** No new table and no data rewrite; automatic backup discovery remains unchanged.
- **Mitigation:** Policy matrix tests, authenticated browser verification, exact database count comparison, and no broad auth-schema grants.
- **Rollback:** Restore the previous policies and drop the helper. No data rollback is required.

## 5. Step-by-step Plan
1. **Secure the login-access predicate**
   - Add a SECURITY DEFINER helper that answers only whether a profile ID has a platform login.
   - Lock its `search_path`, revoke public execution, and grant execution only to `authenticated` and `service_role`.
   - Replace direct `auth.users` references in the affected instance and response SELECT policies with this helper.
   - Preserve all existing employee, assigned-reviewer, Admin, HR PMS, and completed-upline visibility branches.

2. **Audit ADR-162 sibling paths**
   - Update any hierarchy-completed policy/RPC path that performs the same unsafe auth-schema check.
   - Confirm the hierarchy RPC still restricts results to login-enabled employees and remains server-side paginated.

3. **Complete status aggregation**
   - Add `pending_dept`, `pending_management`, and `excluded` to the status-count model.
   - Include department and management queues in “In Progress”.
   - Keep excluded rows separate internally so the existing Total definition remains stable and future UI filtering stays correct.

4. **Stop masking backend failures**
   - Gate all Progress queries on `isReady && !!user` and include the user ID in auth-scoped query keys.
   - Render a clear error state with Retry when counts or paginated rows fail; do not display zero cards as if the request succeeded.
   - Keep the current table, filters, and pagination unchanged.

5. **Regression coverage and verification**
   - Add policy-contract tests proving no client-facing RLS policy directly queries `auth.users` and all reviewer slots remain present.
   - Add count tests covering department, management, completed, and excluded statuses.
   - Update realistic mock status data with all current workflow states and failure cases.
   - Verify live as an authenticated Admin: no 403 responses, Total = 2,580, Completed = 1,767, In Progress includes 12 department + 279 BU + 17 management, and the first paginated rows render.
   - Verify a hierarchy viewer still sees only completed, login-enabled employees in their allowed downline.

## 6. UI Changes
- **Location:** Annual Review Admin → Progress.
- **Visual change:** No redesign. On query failure, replace misleading zero metrics/empty table with an inline error and Retry action.
- **Interaction:** Existing filters, downloads, bulk actions, and pagination remain unchanged.
- **Responsiveness:** Error state uses the existing responsive card/container layout.

## 7. Implementation
Pending approval.

## 8. Tests
- RLS policy safety/role matrix.
- Full annual-review status aggregation.
- Query failure versus genuine empty-state rendering.
- Auth-ready/user-scoped query gate.
- Authenticated browser/network verification.

## 9. DOCUMENTATION.md Updates
Document the confirmed 403 RCA, secure helper pattern, complete status aggregation, measured database totals, rollback, and version-history entry.

## 10. POLICY.md Updates
Add the rule that client-facing RLS policies must never directly query protected auth tables; platform-login checks must use a minimal SECURITY DEFINER boolean helper. Record all supported annual-review statuses in the aggregation contract.

## 11. Post-implementation Notes
- CAPA: add a static regression guard against protected-schema references in RLS policy migrations.
- No users, reviews, scores, reviewer mappings, or workflow stages will be changed.
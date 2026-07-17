## 1. Assumptions
- “Not fixed” means Umesh Kumar Mehta (employee 100316) still sees **0 employees** on `/annual-review/team` after signing in or refreshing.
- The uploaded screenshot shows the same empty-queue symptom from Amarjeet Kumar; Amarjeet’s organizational mapping will be diagnosed separately because the backend currently has no annual-review reviewer assignments for him.

## 2. Clarifications
- None required to begin. The backend evidence is sufficient to isolate Umesh’s issue.

## 3. Risk & Impact Report
- **Data impact:** Umesh already has **89** active-cycle reviewer assignments, including **68 currently awaiting Dept Head action**. His profile ID and authentication ID match, and he is active. No second remap or historical-row rewrite is justified.
- **Workflow impact:** The fix will change only how the Team Annual Review queue is retrieved for the signed-in reviewer; reviewer hierarchy, scores, stages, and completed reviews remain unchanged.
- **UI/UX impact:** The page will no longer silently convert a failed queue request into “No employees in your queue.” A genuine empty queue and a load failure will be distinct states.
- **Security impact:** Queue identity will be resolved from the authenticated session in the backend, rather than trusting a reviewer ID supplied by the browser. Results remain constrained to rows where the caller occupies an enabled reviewer slot.
- **Regression risk:** Moderate because all reviewer roles use this queue. Mitigate with role, RLS, pagination, status, search, and failure-state tests.
- **Scalability impact:** Preserve server-side pagination (20 default, 100 maximum), exact counts, sorting, and search limits; do not load full reviewer queues.
- **Rollback:** Restore the existing service queries and remove the additive queue RPCs; no data rollback is needed.

## 4. Step-by-step Plan
1. Add authenticated, paginated backend queue/count functions that derive the reviewer from the session and return only enabled reviewer relationships for the active cycle.
2. Replace the browser-built five-column reviewer query and role-count queries with the backend functions, preserving current filters, sorting, search, and pagination.
3. Add explicit queue error handling with a retry action; render “No employees in your queue” only after a successful zero-row response.
4. Verify Umesh’s expected result against the active cycle: **89 total assigned**, with the current status distribution preserved (68 `pending_dept`, 18 `pending_self`, 3 `pending_bu`).
5. Diagnose Amarjeet separately in the same validation: his current backend assignment count is genuinely 0, so do not disguise that master-data issue as the same retrieval defect.

## 5. UI Changes
- **Location:** `/annual-review/team`, in the employee-grid area.
- **Visual change:** Add a clear load-error alert and Retry button.
- **Interaction:** Existing role/status/search/page controls remain unchanged.
- **Responsiveness:** Alert follows the existing responsive content width; no navigation or layout changes.

## 6. Implementation
- Add a migration containing the authenticated reviewer-queue and reviewer-role-count functions, with explicit authenticated/backend grants and anonymous access revoked.
- Update the Annual Review service and hooks to consume those functions.
- Keep the page component rendering-focused and surface query errors instead of defaulting to an empty array.
- Add an immutable audit/diagnostic path only if needed; this retrieval fix does not mutate sensitive review data.

## 7. Tests
- Unit tests with realistic mock reviewers: Umesh as multi-department head, multi-role reviewer, inactive reviewer, genuine zero-assignment reviewer, and request failure.
- Validate happy paths and failures for pagination, search, status filter, scope filter, enabled-stage filtering, and identity isolation.
- Backend contract test: one authenticated reviewer cannot request another reviewer’s queue.
- Run the focused Annual Review test suite and verify the rendered queue/error states.

## 8. DOCUMENTATION.md updates
- Document the authenticated reviewer-queue retrieval contract, pagination limits, error semantics, and version-history entry in both root and Annual Review technical documentation.

## 9. POLICY.md updates
- Add/align the rule that Team Annual Review visibility is session-derived, enabled-stage-aware, and must distinguish retrieval failure from a genuine empty queue.

## 10. Post-implementation notes
- This avoids another unnecessary data repair: Umesh’s 89 mappings are already present.
- Backup coverage remains automatic because no new table is required.
- Amarjeet’s screenshot represents a separate master-data/mapping case and will be reported with its exact cause after queue retrieval is corrected.
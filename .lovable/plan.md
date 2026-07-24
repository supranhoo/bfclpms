# ADR-162 — Hierarchy Visibility of Completed Annual Reviews

Give every stakeholder in an employee's reporting chain (Reporting Manager, Skip-Level / Dept Head, BU Head, Management, plus Admin/HR) read-only access to that employee's completed annual review — restricted to employees who have a platform login (auth.users row present).

Entry point: **Team Annual Review** page only. No new top-level route.

---

## Risk & Impact

- **Data**: no schema mutation; adds one SECURITY DEFINER RPC + one view. Read-only surface — no writes.
- **Workflow**: unchanged. Existing "queue" (action items) and "assist" flows untouched.
- **UI/UX**: adds a second tab "Hierarchy — Completed" beside the current queue. Zero change to existing tab.
- **Regression**: contained to Team Annual Review page + one new RPC. No trigger changes.
- **Security**: RPC gates by (a) caller in employee's upline chain OR admin/hr_pms, and (b) employee has `auth.users` row. RLS on `annual_review_instances` unchanged; new RPC is the only widened path.

## Scope Rules (who sees whom)

Given caller C and employee E with a **completed** instance in the current cycle, C sees E's completed review iff **any** is true:
1. C is Admin or HR PMS.
2. C is E's Reporting Manager (direct).
3. C is a Skip-Level / Dept Head above E (recursive upline via `annual_review_subtree_ids` inverse).
4. C is BU Head of E's Business Unit (via `business_units.head_id` chain including headed BUs — reuse ADR-111 logic).
5. C is Management above E's chain (reuse ADR-158 direct-report logic + transitive management chain).

**Gate**: `EXISTS (SELECT 1 FROM auth.users WHERE id = E.employee_id)` — instances for non-login employees are excluded.

## Backend Deliverables (single migration)

1. `get_hierarchy_completed_reviews(p_cycle_id uuid, p_search text, p_page int, p_page_size int)` — SECURITY DEFINER, returns paginated rows: `instance_id, employee_id, employee_code, employee_name, department, business_unit, final_rating_5, total_score_100, completed_at, terminal_role, terminal_reviewer_name, acknowledged_at, viewer_relationship` (enum: `admin|hr|manager|skip|dept_head|bu_head|management`).
   - Page size capped at 100 (per ADR-annual-review §6).
   - Uses existing helpers `is_admin_or_hr_pms`, `annual_review_subtree_ids`, `is_bu_head`, and the management resolver.
2. `get_hierarchy_completed_review_detail(p_instance_id uuid)` — SECURITY DEFINER, returns the full read-only bundle already used by `EmployeeResultsView` (scores, criteria, all stage responses, system scores, self-review answers, acknowledgment). Rejects if caller fails the same 5-rule gate or if instance is not `completed`.
3. Audit: every detail read writes one row to `annual_review_access_audit` with `action='hierarchy_view_completed'` (extend the check constraint accordingly).

## Frontend Deliverables

- **`TeamAnnualReview.tsx`**: add a tab switcher `My Queue` (existing) | `Hierarchy — Completed` (new). URL param `view=hierarchy` for deep link + Back-restore parity.
- **`HierarchyCompletedList.tsx`** (new): server-paginated table using `useHierarchyCompletedReviews`. Columns: Employee, Dept / BU, Terminal Reviewer, Completed On, Rating (x.xx / 5), Acknowledged?, Relationship badge, `View` action.
- **`HierarchyCompletedDetail.tsx`** (new route `/annual-review/hierarchy/:instanceId`): renders the existing `EmployeeResultsView` in fully read-only mode using the new detail RPC. Shows a "You are viewing as {relationship}" info banner.
- **Hooks** in `src/hooks/annualReview/`: `useHierarchyCompletedReviews`, `useHierarchyCompletedReviewDetail`.
- **Service** `src/services/annualReview/hierarchyVisibility.ts` — thin wrapper over the two RPCs.

## Non-Login Employee Handling

RPCs filter `employee_id IN (SELECT id FROM auth.users)`. Empty-state copy on the tab explains: "Only employees with active platform access appear here."

## Testing

- Vitest: `hierarchyVisibility.test.ts` — mocks RPC and asserts 5-rule filtering + login-only filter.
- SQL: assertion queries confirm (a) 0 rows for a peer with no upline relationship, (b) rows appear for direct manager, skip, BU Head, Management, Admin, (c) 0 rows for a non-login employee.
- Manual smoke: verify with Gaurav Budhia (Management), a Dept Head, and a BU Head against 3 completed instances.

## Rollback

Single migration file — drop the two RPCs and revert the audit check constraint. Frontend tab is gated by a feature flag `hierarchy_completed_view.enabled` in `admin_feature_flags` for staged rollout.

## Docs

- `docs/adr/ADR-162.md` — decision record.
- `POLICY.md` §AR-HIERARCHY-COMPLETED-VIEW — read-only, login-only, audit-logged, 5-rule scope.
- `DOCUMENTATION.md` — new section under Annual Review > Visibility.

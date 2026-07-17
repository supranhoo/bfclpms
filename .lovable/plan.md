## Fix: Managers & Skip-Level Managers must see their team in Team Annual Review (visibility-only)

### Root Cause (RCA)
- `get_my_annual_review_queue` (SECURITY DEFINER) only returns instances where the caller is *slot-assigned* (`manager_id = uid` / `skip_id = uid` / `dept_head_id = uid` …).
- The 2025‑2026 cycle's `default_enabled_stages` was changed today to `["self","dept_head","bu_head"]`, so the reviewer-slot-clear trigger (mig `20260717062346`) nulled every instance's `manager_id` and `skip_id`. Result: every reporting/skip manager's Team Annual Review page now shows **0 in queue**.
- Per user decision, the reduced workflow stays (`Self → Dept Head → BU Head`); only the **visibility gap** is fixed.

### Approach — Widen visibility without touching the workflow
Introduce a "reports-to subtree" branch in the queue resolver:
- A caller sees an instance if **any** of these is true (current OR-list plus two new terms):
  1. slot-assigned (existing 5 conditions), OR
  2. `employee.reporting_manager_id = uid`  ← direct-report, always visible, and
  3. `uid` is an ancestor of `employee` in the reporting chain within N hops (skip-level & downline).
- Rows added by (2)/(3) are marked `visibility_only = true` in the returned JSON so the UI can render them as read-only (no reviewer action buttons).
- Scope filter (`manager` / `skip`) is preserved: `manager` scope returns direct reports, `skip` scope returns indirect subtree.
- `all` (the default the page uses) returns the union.

### Scope of changes

1. **DB migration — resolver widening only** (no data mutation, no schema change):
   - Redefine `public.get_my_annual_review_queue` and `public.get_my_annual_review_role_counts`.
   - Add helper `public.annual_review_subtree_ids(uid, max_depth int default 6)` — recursive CTE over `profiles.reporting_manager_id`, filtered to `is_active`, memoised via `STABLE`.
   - Queue query becomes: existing slot predicate **OR** `employee.id IN (subtree)`.
   - Add `visibility_only` boolean to each row (`true` when slot predicate is false).
   - Row-count `get_my_annual_review_role_counts` gets a new bucket `subtree` alongside existing manager/skip/dept/bu/hr.

2. **RLS parity** — `can_access_annual_review_instance_for_assistance`:
   - Add subtree branch so opening a subordinate's review detail from the widened queue does not 403.
   - Detail view stays read-only for subtree-only viewers (enforced client-side via `visibility_only`).

3. **UI (surgical, presentation only)**:
   - `src/pages/annual-review/TeamAnnualReview.tsx` (list): show a small `View only` chip on rows where `visibility_only = true`.
   - `src/pages/annual-review/TeamAnnualReviewDetail.tsx`: when `visibility_only`, disable Save/Send-back/Approve controls; render an info banner "You're viewing this record as reporting/skip manager. This cycle's workflow doesn't include the Manager stage, so no action is required from you."
   - Empty-state text updated to distinguish "no reports" vs "no team assignments".

4. **Tests & regression guards**:
   - `src/tests/annualReview/queueSubtreeVisibility.test.ts` — mocks RPC, asserts direct + skip subtree rows appear with `visibility_only=true` and no action controls render.
   - `supabase/migrations/.../*_test_notes.sql` block-comment with hand-run assertions (documented, not executed).
   - Add SQL contract test in `src/tests/canSendNotificationToSchema.test.ts` style: pin that the queue function body contains the subtree branch.

5. **Docs & policy**:
   - `docs/adr/ADR-113.md` — "Team AR visibility decoupled from reviewer slot".
   - `POLICY.md §AR-TEAM-QUEUE-VISIBILITY` — reporting managers always see their subtree; write actions still require being a slot-assigned reviewer.
   - `DOCUMENTATION.md` v2.66.116 entry with the 5-Why + CAPA.

### Risk & Impact
| Area | Impact | Mitigation |
|---|---|---|
| Data | None — read-only widening | No UPDATE/INSERT statements |
| Workflow | None — Self → Dept → BU untouched | Subtree rows carry `visibility_only=true`; UI hides action buttons |
| RLS | Widened for subtree callers | Bounded to `is_active` reporting chain via SECURITY DEFINER; write policies unchanged |
| Perf | New recursive CTE per call | Depth-capped at 6 hops, indexed on `profiles.reporting_manager_id`; page size stays 20 |
| Regression | Existing slot-assigned users must still see full action UI | New unit test + role-counts contract test |

### Rollback
Single migration; revert by redefining `get_my_annual_review_queue` / `_role_counts` / `can_access_annual_review_instance_for_assistance` to their previous bodies and dropping `annual_review_subtree_ids`. No data changes to undo.

### Out of scope (explicit)
- Not re-enabling `manager` / `skip_manager` stages on the cycle.
- Not changing `create_or_get_annual_review_instance` or the resync trigger.
- Not altering write-side RLS on `annual_review_responses`.

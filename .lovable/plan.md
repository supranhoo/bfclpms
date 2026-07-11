## Issue 1 — "insert or update on notifications violates FK notifications_user_id_fkey" during bulk send-back

### RCA
- `notifications.user_id` is `FK → auth.users(id) ON DELETE CASCADE`.
- The trigger `notify_annual_review_stage_change` (AFTER UPDATE of `overall_status` on `annual_review_instances`) inserts a notification for the new stage recipient without checking that the recipient exists in `auth.users`.
- Non-login employees exist in `public.profiles` but have no `auth.users` row (they were never invited). When a send-back returns the instance to a non-login self/manager/skip/dept/bu/hr, the FK fires and aborts the whole RPC — so `send_back_annual_review_status` fails and no instance is reverted. The bulk send-back UI shows the exact FK message.
- Secondary bug in the same trigger: the recipient `CASE` omits `pending_dept` → `NEW.dept_head_id`, so dept-head transitions never notify anyone, and any status matching that branch returns `NULL` recipient (which is currently skipped, but still incorrect).

### Fix (DB migration only)
Redeploy `notify_annual_review_stage_change`:
1. Add the missing `WHEN 'pending_dept' THEN NEW.dept_head_id` branch.
2. Guard the INSERT with `IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = v_recipient) THEN RETURN NEW;` — silently skip notifications for non-login recipients so send-back succeeds.
3. Wrap the INSERT in `BEGIN … EXCEPTION WHEN foreign_key_violation THEN RAISE LOG 'notify_annual_review_stage_change: skipped notification for %', v_recipient; END;` as a defensive net so a future FK regression never blocks business flow.

No table/column change. No RLS/GRANT change.

### Tests
- New test `src/test/annualReview/sendBackNotificationFk.test.ts` — asserts the fixed trigger source contains the `EXISTS auth.users` guard and the `pending_dept` branch.

---

## Issue 2 — Wrong Dept Head / BU Head shown in workflow vs. employee-master reporting

### RCA
Investigated instance for **Abhishek Raj (200449, EHS-Health)**:

| Field on instance                | Value                                    | Source in code                                       |
|----------------------------------|------------------------------------------|------------------------------------------------------|
| `manager_id`                     | a417ccfa (Abhishek's reporting manager)  | `profiles.reporting_manager_id` ✓                    |
| `dept_head_id`                   | aed8c5e5 = Jitendra Kumar (200114)       | `departments.head_user_id` for "EHS-Health"          |
| `bu_head_id`                     | 1a92c542 = Dinesh Chandra Chaudhary      | `business_units.head_user_id` for "EHS"              |

Problem: **Jitendra Kumar (200114) also has `reporting_manager_id = a417ccfa`**, i.e. he is a *peer* of Abhishek Raj (same reporting manager). Making a peer the "Dept Head" reviewer contradicts the employee-master hierarchy.

Two contributing causes:
- (a) `departments.head_user_id` for EHS-Health is misconfigured (an employee, not an actual dept head).
- (b) `seedInstances` in `src/services/annualReview/annualReviewService.ts` (~line 942) trusts the configured `head_user_id` blindly. There is **no sanity check** that the dept/BU head sits *above* the employee in the reporting chain.

The `enabled_stages` for this employee's archetype are `["self", "dept_head", "bu_head"]` — no `manager` stage — so the misassignment is what the reviewer sees at every stage.

### CAPA

**1. Pure hierarchy-guard helper (new)**
`src/lib/annualReview/hierarchyGuard.ts`:
```ts
resolveHierarchicalHead({
  employeeId, configuredHeadId, mgrMap /* id → reporting_manager_id */
}): { headId: string | null; usedFallback: boolean; reason?: string }
```
Rules (in order):
- If `configuredHeadId` is null → return null.
- If `configuredHeadId === employeeId` → fallback, reason `self`.
- If `configuredHeadId === mgrMap[employeeId]` → keep (direct manager is a valid dept head).
- Walk `mgrMap[employeeId]` upward; if `configuredHeadId` appears anywhere in the ancestor chain → keep.
- If `mgrMap[configuredHeadId] === mgrMap[employeeId]` (same manager = peer) → fallback, reason `peer`.
- Else (not an ancestor) → fallback, reason `not_in_chain`.

Fallback value = `mgrMap[employeeId]` (direct manager); BU-head fallback = `mgrMap[mgrMap[employeeId]]` (2 hops up), matching the existing `buFallback` logic.

**2. Wire the guard into the seeder**
In `seedInstances` (`annualReviewService.ts`) apply `resolveHierarchicalHead` to both `dept_head_id` and `bu_head_id` before writing rows. When a fallback fires, push one row into `system_audit_logs` with `action='annual_review.head_fallback'` and metadata `{ employee_id, role, configured_id, resolved_id, reason }` so admins can spot misconfigured departments/BUs.

**3. Admin misconfig warning (UI, low risk)**
On Business Units and Departments admin tables, show a small amber badge next to a head that fails the guard for **any** currently-assigned member. Copy: "Head is a peer/member — verify hierarchy". No blocking, just visibility.

**4. Backfill (opt-in, no auto-run)**
Do **not** silently re-seed live instances. Add a "Re-resolve hierarchical heads" button under Annual Review Admin → Bulk Actions that re-runs the guard on all `pending_*` instances of the active cycle. Existing overrides (via `annual_review_assignment_overrides`) are preserved by `writeSeedRowsPreservingOverrides`.

### Tests
- `src/test/annualReview/hierarchyGuard.test.ts` — self, peer, direct-manager, deep-ancestor, unrelated, null cases.
- Extend `src/services/annualReview/annualReviewService.test.ts` (or new focused file) — mock `seedInstances` inputs where configured dept head is a peer and assert fallback + audit row payload shape.

---

## Files touched (build phase)

- new migration — fix `notify_annual_review_stage_change` (Issue 1)
- `src/lib/annualReview/hierarchyGuard.ts` (new)
- `src/services/annualReview/annualReviewService.ts` — call guard in `seedInstances`, write fallback audit rows
- `src/pages/annual-review/AnnualReviewAdmin.tsx` — "Re-resolve hierarchical heads" bulk action button
- `src/components/admin/BusinessUnitsTable.tsx` / `DepartmentsManager.tsx` (if present) — misconfig badge
- Tests: `hierarchyGuard.test.ts`, `sendBackNotificationFk.test.ts`

## Risk

- **Trigger change:** silent-skip may hide notification gaps for non-login users; mitigated by `RAISE LOG`. Send-back can no longer be blocked by notification FK.
- **Seeder guard:** newly-seeded instances (and opt-in re-resolve) may switch reviewer for employees where the configured dept/BU head was a peer — this is the desired correction. Overrides preserved.
- No schema change, no RLS/GRANT change, no data deletion. Rollback = revert migration + code diff.

## Not changed

- Existing bulk send-back UI, RPC signatures, `send_back_annual_review_status` body.
- `departments`/`business_units` schema.
- Existing archetype / enabled_stages logic.

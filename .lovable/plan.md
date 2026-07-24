## Goal
Give **Management** reviewers (e.g. Gaurav Budhiya) a working queue and detail page for their `pending_management` stage — the same UX Manager/HOD/BU-Head already have — so they can open, score, and submit final approval on the reviews now landing at their desk (ADR-138).

## Current state (verified)

- `annual_review_instances.management_id` is populated by ADR-148 backfill; instances now advance to status `pending_management`.
- Backend RPC `get_my_annual_review_queue` (mig `20260717134401`) hard-codes scopes to `'any' | 'manager' | 'skip' | 'dept' | 'bu' | 'hr' | 'subtree'` — **no `management` branch**, and validator rejects `'pending_management'` in `p_status`.
- `get_my_annual_review_role_counts` returns only manager/skip/dept/bu/hr/subtree.
- Frontend (`src/pages/annual-review/TeamAnnualReview.tsx`) `STATUS_FILTERS`, `SCOPE_FILTERS`, `SCOPE_BADGE_LABEL`, and `resolveMyRole()` do not know about `management` / `pending_management` / `management_id`.
- `src/services/annualReview/annualReviewService.ts` `ReviewerScope` type and `ReviewerRoleCounts` shape omit `management`.
- `src/lib/annualReview/stageForReviewer.ts` already returns `'management'` for `pending_management` when `management_id === uid` → the detail page **will render in edit mode** for a Management user once the queue lists it. No detail-page change required.
- Sidebar (`useMenuAccess.ts`) already grants `management` role access to `team-reviews` and `management-review`, so the entry point exists.

Net effect: even though data is correctly parked at `pending_management`, a Management user opens **Team Annual Review** and sees an empty queue with no filter chip and no way to reach the instance.

## Risk & Impact

- **Data:** none — no schema change, only RPC signature widening + new enum values accepted.
- **Workflow:** unlocks the final Management approval step for ~14 BU-Head instances plus any future ones.
- **UI:** adds one status option, one scope chip, one badge label; no removals.
- **Regression:** low — additive `WHEN 'management'` branches; existing scopes untouched. Guarded by unit tests.
- **Rollback:** re-run prior migration `20260717134401` to restore old RPC.

## Plan

### 1. Backend (single migration)
Recreate `get_my_annual_review_queue` and `get_my_annual_review_role_counts`:

- Extend `v_scope` allow-list with `'management'`.
- Extend `v_status` allow-list with `'pending_management'`.
- Add `is_named` term `(enabled_stages ? 'management' AND management_id = v_uid)` so `'any'` includes management rows.
- Add `WHEN 'management' THEN v.i.enabled_stages ? 'management' AND v.i.management_id = v_uid`.
- Role-counts RPC: add `'management'` bucket; include the same predicate in the outer visibility `WHERE`.

### 2. Frontend
`src/services/annualReview/annualReviewService.ts`
- `ReviewerScope`: add `'management'`.
- `ReviewerRoleCounts`: add `management: number` and read `counts?.management` in `getReviewerRoleCounts`.

`src/pages/annual-review/TeamAnnualReview.tsx`
- `STATUS_FILTERS`: append `{ value: 'pending_management', label: 'Management' }`.
- `SCOPE_FILTERS`: append `{ value: 'management', label: 'Management' }`.
- `SCOPE_BADGE_LABEL`: add `management: 'Management'`.
- `resolveMyRole()`: append `if (row.management_id === uid && has('management')) return 'management';` at the end of the chain (lowest priority so it doesn't shadow closer relationships).
- Ensure the "My role" chip rendering block renders the management chip when `counts.management > 0`.

### 3. Detail page
No change — `stageForReviewer` already maps `pending_management` → `management` from `management_id`, so the review form loads in edit mode with submit/send-back controls.

### 4. Tests
- Extend `src/test/bulkReview/…` or add `src/test/annualReview/managementScope.test.ts` covering:
  - `resolveMyRole` returns `'management'` when only `management_id` matches.
  - Scope-filter selection routes to RPC with `p_scope='management'`.
- Add mock rows with `overall_status='pending_management'` and `management_id=uid` to `mocks`.

### 5. Documentation
- Append **ADR-149 — Management scope on Team Annual Review queue** to `DOCUMENTATION.md`.
- Update `POLICY.md §AR-TEAM-QUEUE-VISIBILITY`: add management to named-reviewer predicate and to allowed scope/status enums.

## How a Management user will experience the flow (post-change)

1. Log in → sidebar shows **Team Annual Review** (already visible for `management` role).
2. Page loads → **"My role: Management (N)"** chip appears alongside any other chips they have.
3. Click chip → queue filtered to `pending_management` rows where they are the mapped `management_id`.
4. Open a row → detail page loads in edit mode (Management stage) with scoring + Submit / Send Back.
5. On submit → advancement engine marks `status='completed'` (terminal), audit log captures `management` performer.

## Verification steps

1. Run migration; retry queue for Gaurav Budhiya → non-empty list of the 14 backfilled BU-Head instances.
2. Open one instance → editable Management scorecard renders.
3. Submit → instance flips to `completed` and audit row records `management` reviewer.
4. Unit tests green; existing manager/HOD/BU/HR scopes unchanged (regression suite passes).

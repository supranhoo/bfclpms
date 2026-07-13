## Root cause

Shailesh Singh (200511, `3ad163a6-…`) is blocked by the **pilot allow-list gate** on `/annual-review`, not by data or RLS.

Evidence:
- His instance `31e8123c-…` is healthy: `overall_status = pending_self`, `self` response row exists, `reviewer_id` = Shailesh, `is_locked = false`. RLS on `annual_review_instances` and `annual_review_responses` allows him to read AND update.
- The active cycle "Annual Review – 2025-2026" is the only one; `useMyInstance` would return his row.
- `AnnualReviewGate` calls the feature-flag RPC `is_feature_flag_enabled_for_me('annual_review_enabled')`. That flag has:
  - `value = true`
  - `target_roles = {admin, hr_pms}`
  - `target_user_ids` = 632 uuids — **Shailesh's uuid is NOT in this list**
- So the RPC returns `false` for him → gate does `<Navigate to="/dashboard" replace />` → the "Read-only" page he sees is the dashboard, not the self-review form. The admin's screenshots are the `/annual-review/team/:id` route (reviewer view), which correctly renders read-only for anyone who isn't the active-stage reviewer.

## Risk & Impact Report

- **Data impact:** None. No schema, RLS, or historical data changes.
- **Workflow impact:** Any employee who has a seeded annual-review instance but is missing from `admin_feature_flags.target_user_ids['annual_review_enabled']` becomes unable to submit self-review. This is a data-drift bug in the pilot allow-list, not a code bug — but it is currently silent (redirect to dashboard, no message).
- **UI/UX impact:** After fix, affected employees regain access to `/annual-review` and the sidebar "My Annual Review" link.
- **Regression risk:** Low. We only widen access to users who already have a seeded instance in the current active cycle; admin/hr_pms remain covered by role.
- **Scalability impact:** One extra RPC-side `EXISTS` check against `annual_review_instances` scoped by `employee_id = auth.uid()` + active cycle — indexed lookup.
- **Mitigation:** Keep the existing role/user-id allow-list; only ADD the instance-existence path. Unit test on the RPC + gate.

## Plan

**A. Immediate unblock for Shailesh (data fix — 1 row)**
- Append `3ad163a6-3c1b-4adb-b9c1-382f77b94542` to `admin_feature_flags.target_user_ids` for key `annual_review_enabled`. Idempotent, audit-friendly.

**B. Structural fix (SSOT — instance existence implies pilot access)**
- Amend the SECURITY DEFINER function `is_feature_flag_enabled_for_me` (only for the `annual_review_enabled` branch, or via a wrapper) so it also returns `true` when there is a non-excluded `annual_review_instances` row in an `active` cycle with `employee_id = auth.uid()`, `manager_id = auth.uid()`, `skip_id = auth.uid()`, `dept_head_id = auth.uid()`, `bu_head_id = auth.uid()`, or `hr_id = auth.uid()`.
- Rationale: an assigned reviewee or reviewer is by definition already in the pilot; requiring double-bookkeeping in the allow-list produces exactly this bug.
- Keep the explicit `target_roles` / `target_user_ids` paths unchanged.

**C. Diagnostic surface (prevent silent redirect)**
- In `AnnualReviewGate`, when `enabled !== true` AND the user has any seeded instance in the active cycle, log a `console.warn` with the instance id and show a small "You don't have pilot access — contact HR" card instead of a silent redirect to `/dashboard`. Prevents future "why can't I fill self review" tickets.

## Technical details

- Migration: `ALTER FUNCTION public.is_feature_flag_enabled_for_me(text)` — add the annual-review-specific EXISTS branch. Search-path pinned, `SECURITY DEFINER`, unchanged signature.
- Data patch (Section A): single `UPDATE admin_feature_flags SET target_user_ids = array_append(...) WHERE key = 'annual_review_enabled' AND NOT ('…' = ANY(target_user_ids))`.
- Frontend touch: `src/components/annual-review/AnnualReviewGate.tsx` — replace the blanket `<Navigate to="/dashboard">` with a conditional info card when a seeded instance exists.
- Tests:
  - `AnnualReviewGate.test.tsx` — new case: flag `false` + seeded instance → renders children (post-RPC fix) OR shows the diagnostic card (frontend fallback).
  - PG regression: `pg_tap`-style check that `is_feature_flag_enabled_for_me` returns true for a user with a pending self instance who is not in `target_user_ids`.
- DOCUMENTATION.md: add entry under "Annual Review – Pilot Access" describing the SSOT change.
- POLICY.md §AR-PILOT-ALLOWLIST: amend — instance assignment is authoritative; explicit allow-list remains for pre-seed dry runs.

## Rollout & rollback

- Section A is instantly reversible (`array_remove`).
- Section B function change ships behind a normal migration; rollback = redeploy prior function body (kept in `docs/adr/`).
- Section C is a pure UI change.

## Steps → Verification

1. Apply data patch A → verify `is_feature_flag_enabled_for_me` returns true for Shailesh via psql (`SET LOCAL role authenticated; SET LOCAL request.jwt.claims …`) — Shailesh can now open `/annual-review` and see editable form.
2. Ship migration B → same RPC returns true for another sampled reviewee not in the allow-list.
3. Ship frontend C → simulate `enabled=false` with seeded instance in unit test; assert diagnostic card renders (no redirect).
4. Manually re-check with a second affected user before closing.

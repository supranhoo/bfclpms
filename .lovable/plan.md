# Fix — Assisted-submission photo upload blocked by RLS for downline managers

## What the user saw
Awadhesh Kumar Singh (a manager) opened the Assisted Submission dialog for a team member, attached `Subu.jpeg`, and hit "Verify & Submit". The `proxy-selfies` storage upload was rejected with `new row violates row-level security policy`, so the flow never reached the audit insert or the self-submit RPC.

## Not applicable (No.) — this is NOT the same bug we fixed earlier

Earlier we fixed:
- ADR-110 — expanded the **directory resolver** so managers see downline names in the picker.
- ADR-111 — expanded `can_access_annual_review_instance_for_assistance` so managers can **open** downline instances.
- ADR-115 — HR proxy submit no longer requires final `weighted_score`.

The RLS check on the `proxy-selfies` bucket is a different function: `can_proxy_submit_annual_review`. It was never widened when ADR-110/ADR-113 introduced the subtree/team scope. That's the leak.

## Confirmed root cause (verified against live DB)

Storage INSERT policy `proxy_selfies_insert` gates the upload with:

```
can_proxy_submit_annual_review( first_path_segment::uuid, auth.uid() )
```

`pg_get_functiondef` for that function shows it allows the caller when they are:
- direct manager / skip / designated proxy of the employee,
- admin or hr_pms,
- direct head of the employee's department or BU (or head of any department under that BU),
- `annual_review_directory_access(uid).scope = 'all'` **or** `'bu'` matching the employee's BU.

It does NOT handle:
- `scope = 'team'` (the new manager subtree scope from ADR-110), or
- any deeper reporting subtree via `annual_review_subtree_ids` (ADR-113).

So a manager two levels above the employee — who can see the employee in the picker and open the form — is still rejected by both the RLS on `annual_review_proxy_submissions` insert and by the storage-bucket RLS on `proxy-selfies`. The upload is the first RLS-guarded write in the flow, which is why the user sees the "Photo upload failed" toast.

## Fix (ADR-118 / POLICY §AR-ASSISTED-PROXY-SUBTREE)

Single migration, no UI changes:

1. Update `public.can_proxy_submit_annual_review(_instance_id, _proxy_user_id)`:
   - Keep every existing allow-branch (direct manager / skip / designated proxy / admin / hr_pms / dept-head / BU-head / directory scope `all` / matching `bu`).
   - Add: allow when the employee is in the caller's reporting subtree, using the existing `public.annual_review_subtree_ids(_proxy_user_id)` helper (the same one the queue RPC uses). This automatically covers direct + indirect reports without inventing a new hierarchy walk.
   - Add: allow when `directory_access.scope = 'team'` **and** the employee is in the caller's subtree (defense-in-depth against a mis-scoped directory row).
   - Keep the pre-conditions untouched: `auth.uid() = _proxy_user_id`, `assisted_self_submission_enabled = true`, `overall_status = 'pending_self'`, and the "employee has never signed in OR has no email" gate. No widening of who can proxy for a login-capable employee.

2. No changes to `annual_review_proxy_submissions` RLS — it already delegates to the same function via a policy check; widening the function widens both writes consistently.

3. No client changes. `submitWithAssistance` already builds the path as `<instance_id>/photos/<ts>.jpg`, which matches the storage policy's `regexp_split_to_array(name, '/')[1]` cast.

## Verification plan (post-migration)

- Re-run the failing case with Awadhesh (101381) → the pre-flight `checkProxyEligibility` should now return `true` for a downline employee whose status is `pending_self` and who has never signed in. Photo upload must succeed and the audit + RPC must complete.
- Add a regression SQL test on the migration itself (assertion block) that:
  - a synthetic 2-level-down report + a manager proxy user returns `true` from `can_proxy_submit_annual_review`,
  - a random unrelated authenticated user still returns `false`,
  - a login-capable employee (email + `last_sign_in_at`) still returns `false` even for their direct manager (existing guardrail intact).
- Add a Vitest for `buildProxyPhotoPath` verifying the path shape the RLS policy expects (already covered? if not, add one — small, non-invasive).

## Risk & Impact

- **Data impact:** none — function replacement only. No schema change, no backfill.
- **Security impact:** widens proxy eligibility to the caller's *reporting subtree*, but only when the employee is still `pending_self` and has never signed in. Login-capable users remain protected. Auditor / unrelated users still return `false`.
- **Regression risk:** low. Existing branches are preserved verbatim; only additional OR-branches are added. Storage and audit insert share the same predicate, so both paths stay consistent.
- **Rollback:** re-issue the previous function body from git history — pure DDL swap.

## Deliverables
- 1 SQL migration replacing `can_proxy_submit_annual_review` + inline DO-block assertions.
- 1 Vitest regression for the path builder (only if missing).
- `POLICY.md` §AR-ASSISTED-PROXY-SUBTREE + `DOCUMENTATION.md` version-history entry.

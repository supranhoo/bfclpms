## Root cause

When a reviewer sends an annual review back to the self stage, the RPC `send_back_annual_review_status` runs two updates:

1. Unlock the previous stage's response (`is_locked=false`, `submitted_at=NULL`).
2. Move `annual_review_instances.overall_status` back to the previous status.

The function is **not** `SECURITY DEFINER`, so it runs with the caller's rights. On `annual_review_responses` the UPDATE RLS policy requires the caller to be admin/HR-PMS, the `reviewer_id`, or a proxy submitter. When a dept head / manager / BU head / HR reviewer clicks "Send back", none of those apply for the `self` response row, so the UPDATE silently touches **0 rows** (no error — RLS filter). The instance status still flips to `pending_self`, but the self response stays `is_locked=true` with the old `submitted_at`.

Verified on Abes Raja (emp 200687), instance `733e4c88-1cba-4a8d-8cbc-cc674ed02a3f`:
- `system_audit_logs` shows `annual_review.send_back` from `dept_head → self` on 2026-07-14, performed by the dept head (f730b2d8…, not admin).
- Instance `overall_status = pending_self`.
- Self response row: `is_locked = true`, `submitted_at = 2026-07-11` (unchanged).

`EmployeeAnnualReview.tsx` line 69 gates edit mode as:
`locked = myResponse?.is_locked || instance.overall_status !== 'pending_self'`
Because `is_locked` is still true, all fields render read-only and Submit is disabled.

The same defect will silently block every non-admin send-back path (`manager → self`, `skip → manager`, `dept_head → skip/manager`, `bu → dept_head`, `hr → bu`), because in each case the previous stage's response row is owned by a different user.

## Fix

1. **Migration — harden the send-back RPC**
   - Recreate `public.send_back_annual_review_status(uuid, annual_reviewer_role, text)` with `SECURITY DEFINER` and keep `SET search_path = public`. Body is unchanged; permission gating already lives inside the function (`v_is_admin` + explicit caller/stage checks).
   - No signature or return-type change → no frontend impact.

2. **Migration — one-shot data repair for Abes Raja's stuck row**
   - `UPDATE annual_review_responses SET is_locked = false, submitted_at = NULL WHERE instance_id = '733e4c88-1cba-4a8d-8cbc-cc674ed02a3f' AND reviewer_role = 'self' AND is_locked = true;`
   - Scope limited to this single instance/role/state so no other data is touched.
   - Insert a `system_audit_logs` row (`annual_review.response_repair`) recording the manual unlock and reason.

3. **No frontend changes.** Existing UI already handles `is_locked=false` correctly.

## Verification

- After migration, re-open `/annual-review/self` as Abes Raja: fields become editable, Save draft / Submit enabled.
- Spot-check another send-back on a different instance (or in the test cycle) — confirm `annual_review_responses` for the target `reviewer_role` shows `is_locked=false` and `submitted_at=NULL` immediately after send-back by a non-admin reviewer.

## Not applicable

- Schema changes, RLS policy edits, and UI/UX changes are not required.
- `advance_annual_review_status` is out of scope (only touches the caller's own row; RLS allows that).
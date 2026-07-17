
## Reported issue
Awadhesh Kumar Singh (100070, role = `manager`, department head) opens Anup Kumar (101381)'s Annual Review to help submit the self-form on his behalf. Every field renders as **read-only** — the "Verify & Submit on behalf" action never appears.

## Root Cause (5 Whys)

1. **Why is the form read-only?**
   `role` in `TeamReviewDetailContent` resolved to `null` → `locked = true` → `selfEditable = false`.
2. **Why did `role` resolve to null?**
   Awadhesh isn't the current stage reviewer (instance is `pending_self`) and `proxyMode` was `false`, so the code fell through to `role = null`.
3. **Why was `proxyMode` false?**
   The RPC `can_proxy_submit_annual_review` returned `false` for (instance = Anup, proxy = Awadhesh).
4. **Why did the RPC return false?**
   Awadhesh isn't `manager_id`/`skip_id`/`designated_proxy`/admin/hr_pms. The fallback branch uses `annual_review_directory_access(uid)` which returns exactly **one** `business_unit_id` for a department head via `LIMIT 1` without `ORDER BY`. Awadhesh heads two departments in two different BUs (`3X100 TPD-RMH` → BU `659e1a82…`, `1050 TPD-RMH` → BU `88e3ed27…`). Anup sits in dept `1050 TPD-RMH` (BU `88e3ed27…`). When `LIMIT 1` returned the *other* BU, the equality check `v_emp_bu = v_access_bu` failed → `false`.
5. **Why does the system only compare one BU?**
   `annual_review_directory_access` was designed to return a single scope (`all` | `bu` | none). It was never extended to represent "head of multiple BUs / departments", and `can_proxy_submit_annual_review` never consulted `departments.head_user_id` directly for the employee's specific department.

**RCA:** Multi-department HODs get non-deterministic proxy eligibility because the directory-access resolver collapses their scope to a single arbitrary BU. Direct "you head the employee's department" is not checked at all.

## CAPA

### Corrective — new migration
`CREATE OR REPLACE public.can_proxy_submit_annual_review(_instance_id, _proxy_user_id)` — preserve every existing branch verbatim, insert an authoritative direct-headship branch **before** the `annual_review_directory_access` fallback:

```
-- Direct head of the employee's department
IF EXISTS (
  SELECT 1 FROM public.departments
   WHERE head_user_id = _proxy_user_id
     AND id = (SELECT department_id FROM public.profiles WHERE id = v_employee_id)
) THEN RETURN true;
END IF;

-- Direct head of the employee's business unit (any dept in that BU, or the BU itself)
IF v_emp_bu IS NOT NULL AND (
  EXISTS (SELECT 1 FROM public.business_units WHERE id = v_emp_bu AND head_user_id = _proxy_user_id)
  OR EXISTS (SELECT 1 FROM public.departments  WHERE business_unit_id = v_emp_bu AND head_user_id = _proxy_user_id)
) THEN RETURN true;
END IF;
```

No signature change, no other branches touched, no schema change. Function stays `SECURITY DEFINER` with `search_path = public`.

### Preventive
- Add a Vitest that documents the multi-BU HOD proxy contract by mocking the RPC boundary: HOD of the employee's department must be eligible even when they also head a second BU.
- POLICY.md — add "Assisted Submission Eligibility" clause listing every eligible relationship (self, manager, skip, designated proxy, admin, hr_pms, direct department head, direct BU head, HR-team BU directory scope).
- ADR-107 — append the multi-department HOD case and the direct-headship branch decision.
- Changelog / DOCUMENTATION.md — one-line entry.

## Risk & Impact Report

- **Data impact:** none. Function-only change; no schema, RLS, or historical rows touched.
- **Workflow impact:** widens `pending_self` proxy eligibility to include department heads and BU heads of the employee. Matches business intent (they already control review of these employees) and is narrower than the existing `directory_access` fallback for HR-team / admin / hr_pms.
- **UI/UX impact:** none — same `AssistedSubmissionDialog` path is enabled once `proxyMode = true`.
- **Regression risk:** low. All existing `RETURN true` branches remain; new branches are additive `IF EXISTS` short-circuits.
- **Scalability:** two indexed `EXISTS` lookups against `departments`/`business_units` per RPC call (already tiny tables).
- **Rollback:** re-run the previous function definition via a follow-up migration; no data cleanup required.

## Verification

1. `SELECT can_proxy_submit_annual_review('59314a94-0ebc-47d4-9748-4cd19e4cae73', '56fab487-b554-4d2e-9f6a-2a1f4a3fdd63')` → expect `true`.
2. Reload Anup's review as Awadhesh in the preview — self fields become editable, "Verify & Submit on behalf" appears.
3. Vitest suite green.

## Out of scope

- Rewriting `annual_review_directory_access` to return multi-BU scope arrays (larger contract change; not needed for this bug).
- Unrelated notification / trigger errors covered by earlier migrations.

Approve to switch to build mode and apply the migration + tests + docs.

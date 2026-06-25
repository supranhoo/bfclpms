---
name: Profile Identity Integrity
description: Profiles email/employee_code uniqueness, identity-change audit trigger, admin repair RPCs, drift diagnostic, and bulk-import matching rule
type: feature
---
- `profiles.employee_code` unique via `profiles_employee_code_key`. `profiles.email` unique case-insensitive via partial index `ux_profiles_email_ci` (WHERE email IS NOT NULL).
- BEFORE-UPDATE trigger `trg_profiles_identity_audit` writes `profile.identity_changed` to `system_audit_logs` whenever `full_name`, `employee_code`, `email`, or `is_active` changes. Non-bypassable.
- Admin-only RPCs: `repair_profile_identity(uuid, new_code, new_name, new_email, clear_email, set_inactive, reason)` and `create_repair_profile(code, name, set_inactive, reason)`. Both gate on `has_role(auth.uid(),'admin')` and write audit rows. `create_repair_profile` always inserts `email = NULL, has_real_email = false`.
- Diagnostics: admin-only function `list_profile_identity_drift()` (auth-vs-profile mismatch); security-invoker view `v_profile_email_duplicates` (residual shared emails). Both must return 0 rows in steady state.
- Bulk user-import rule: match on `employee_code`, never on `email`. Reject any row whose matched id holds a different `employee_code` or `full_name` unless admin sets `allowRename: true`. This prevents the original identity-swap class of bug (one shared email overwrites the wrong profile row).
- 2026-06-25 one-time repair via `system_audit_logs` action `profile.identity_repair_batch`: 4 re-identifications, 3 email clears, 8 fresh active no-email profiles, 2 inactive duplicate-person rows. See DOCUMENTATION.md v2.66.61.
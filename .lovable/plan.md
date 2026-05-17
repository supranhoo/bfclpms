# Plan: Extend Password Rollout Eligibility to All Role Holders

## Goal
A Safety-only employee (or any employee with *any* `user_roles` row but no KRAs / direct reports) must appear in the Password Rollout "Eligible Users" list so admins can provision their first login.

## Change (single migration, no UI changes)

Replace the `public.eligible_login_users` view with a 4-branch version:

1. `has_kras` — at least one row in `kpis`
2. `reporting_manager` — manager of someone who has KRAs
3. `auditor` — has `auditor` role (kept for backward compatibility of the badge label)
4. **NEW** `role_holder` — has **any** row in `user_roles` not already covered above (safety_admin, safety_user, hr_pms, management, manager, employee, skip_level, admin, …)

Priority order for the `eligibility_type` badge when multiple apply:
`both` (has_kras + reporting_manager) → `has_kras` → `reporting_manager` → `auditor` → `role_holder`

Only active profiles (`is_active = true`) are returned — adds an `is_active` filter that the current view is missing (small cleanup).

## Frontend impact

- `src/hooks/usePasswordRollout.ts` — extend `EligibleUser.eligibility_type` union to include `'role_holder'`.
- `src/pages/admin/PasswordRollout.tsx` (or whichever component renders the eligibility chip) — add a label + color for `role_holder` ("Role Assigned"). Tiny one-liner; no logic change.
- No change to the `password-rollout` edge function — it already auto-provisions any selected profile id (per `mem://features/admin/non-login-user-provisioning`).

## Risk & Impact

| Area | Impact |
|---|---|
| Data | None — view-only change, no schema or row mutations |
| RLS | View runs as definer-equivalent (it's already used by admins only via this screen) — no new exposure |
| Workflow | Admins now see a larger eligible list (anyone with any role). Selection + provisioning flow unchanged |
| Regression | Low — the existing 3 branches are preserved verbatim; new branch is purely additive |
| UI | One new badge value to render |

## Verification

- Vedant Pawar (101966): grant him a Safety role → he appears with `role_holder` badge → "Generate Only / Generate & Send" works → auth user is created on first run (existing logic).
- Existing users with KRAs / direct reports / auditor role still appear with their current badge values (no regression).
- Inactive profiles no longer appear (cleanup).

## Memory / Docs sync
- Update `mem://features/admin/non-login-user-provisioning` with the new "any role holder is eligible" rule.
- Append entry to `POLICY.md` and `DOCUMENTATION.md` Version History (ADR-064: "Password Rollout eligibility extended to all role holders").

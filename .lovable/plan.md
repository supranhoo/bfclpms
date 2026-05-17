## Root cause of "Grant failed" (Vedant 101966)

`iac_user_role_assignments.user_id` has FK → `auth.users(id)`. Vedant exists in `profiles` but has **no `auth.users` row yet** (backfilled employee, never went through password rollout). So any direct insert via `iacService.grantRole` fails with the FK violation you screenshot.

We already solved this exact pattern for Safety with the `grant-safety-role` edge function: it auto-provisions `auth.users` (using the profile's real email, or blocks if missing) before inserting the role row. IAC needs the same treatment.

---

## Brainstorm: unify User Management as the single cockpit

Today the admin must jump across 3 screens:

```text
User Management        → create / edit identity + PMS role
Identity & Access      → grant Safety/HR/other module roles
Password Policy        → trigger password rollout
```

Goal: **User Management becomes the one place** for identity, roles (all modules), password rollout, and full edit. The other two screens stay as bulk/admin power tools but the per-user actions are reachable from User Management.

### Reuse, don't rebuild

| Need | Reuse what already exists |
|---|---|
| Grant/revoke any module role | `iacService` + `useGrantRole` / `useRevokeAssignment` + `useIacRoles` |
| Auto-provision auth before grant | Pattern from `grant-safety-role` edge function — generalize into `grant-iac-role` |
| Password rollout for 1 user | `password-rollout` edge function (already supports `user_ids` array — pass `[id]`) |
| Eligibility surfacing | `eligible_login_users` view (already includes `role_holder`) |
| Email/no-real-email guardrails | `has_real_email` + synthetic email logic in `password-rollout` |

---

## Proposed plan

### Fix 1 — IAC grant must auto-provision auth (unblocks 101966 today)

Create `supabase/functions/grant-iac-role/index.ts` modeled on `grant-safety-role`:
- Admin-gated via `requireAdminUser`.
- Loads target profile. If `auth.users` missing:
  - If `has_real_email` → create auth user (random password, `email_confirm: true`), set `portal_access = true`.
  - If no real email → mint synthetic `@noemail.bfclpms.local` (same convention as password-rollout), set `has_real_email = false`. **Do not block** — admin can still grant the role; they share the password manually after rollout.
- Insert into `iac_user_role_assignments` (scope_type/scope_id from body).
- Audit row in `iac_role_audit`.

Switch `iacService.grantRole` to call this edge function instead of inserting directly. `useGrantRole` signature stays the same → no UI changes needed for IAC console.

### Fix 2 — Make User Management the cockpit

**A. Per-row "Manage Access" action** in the User Management table (new dropdown item next to Edit/Delete) opens a sheet with three tabs:

1. **Roles** — embed a trimmed version of IAC's per-user role manager (role select + scope + grant button + current assignments list). Uses `useIacRoles`, `useGrantRole`, `useRevokeAssignment`. Shows badges for current PMS role + all module roles.
2. **Password** — single-user rollout card: "Generate & email password" + "Generate without email" + last rollout timestamp from `password_rollout_logs`. Calls `password-rollout` with `user_ids: [id]`.
3. **Audit** — recent IAC/auth events for this user (read-only).

**B. Enrich `EditUserDialog`** (screenshot shows it's already organized — extend, don't replace):

Add collapsed sections under existing Personal / Organization / Access:
- **Module Access** — read-only summary chips of all IAC roles + "Manage…" button that opens the Roles tab from (A).
- **Login & Password** — `has_real_email` badge, `portal_access` toggle, "Send password rollout" button, last login + last password-rollout timestamps.
- **Audit Snapshot** — last 5 changes from `email_change_audit` + `iac_role_audit`.

**C. New-user creation flow** — after the existing "create profile" succeeds, show an optional follow-up step:
- "Assign module roles now?" (reuses Roles panel)
- "Send password & email credentials now?" (reuses Password panel)

This keeps the create form fast (one screen, validated) and makes the heavy actions opt-in immediately after.

### Fix 3 — Keep IAC + Password Policy pages

They stay for bulk/matrix work (CSV import, bulk eligibility filter, etc.). Add a "Manage in User Management →" link on each per-user row so admins discover the cockpit.

---

## Risk & impact

- **Data**: New edge function only. No schema changes. (FK stays as-is — we fix the symptom by provisioning auth first.)
- **Workflow**: Net-additive. Existing IAC and Password Policy screens keep working byte-for-byte.
- **RLS**: Edge function uses service role + `requireAdminUser`, same pattern already audited for Safety.
- **Regression risk**: Low. `iacService.grantRole` switches from direct insert → edge call; the rest of IAC console is unchanged. Sheet/tabs in User Management are new components.
- **Mitigation**: Unit-test the new edge function (synthetic-email branch, real-email branch, already-has-auth branch, deactivated user branch). Manual smoke: grant Safety to 101966 from both IAC console and the new User Management sheet — both must succeed and produce identical rows.

---

## Sequencing

1. Ship `grant-iac-role` edge function + switch `iacService.grantRole` to use it → **unblocks Vedant today**.
2. Add "Manage Access" sheet (Roles + Password + Audit tabs) to User Management.
3. Extend `EditUserDialog` with Module Access + Login & Password + Audit sections.
4. Add post-create follow-up step in new-user flow.
5. Add cross-links from IAC console and Password Policy back to User Management.

Confirm and I'll start with step 1.
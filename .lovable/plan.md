
# Employee-Code Login (No-Email Users) — 5-Phase Plan

## Decisions locked in
- Synthetic domain: `noemail.bfclpms.local` (non-routable, no MX possible)
- Password reset for no-email users: **admin-only** via Password Rollout
- Email-add: **trust on submit** (no confirmation link, immediate activation)
- Scope: all 5 phases planned; each phase is independently shippable

---

## Architecture Overview

```text
auth.users.email   = identity key (real OR synthetic <code>@noemail.bfclpms.local)
profiles.email     = contact channel (real email or NULL)
profiles.has_real_email boolean = single source of truth for "can receive mail?"
profiles.employee_code (existing) = login handle for no-email users
```

Login flow:
```text
input → contains "@" ? → use as email
                      → else → RPC lookup_synthetic_email_by_code(input)
                              → returns synthetic email or generic failure
signInWithPassword(resolvedEmail, password)
```

Notification dispatch gate:
```text
before any outbound email send → if NOT profiles.has_real_email → drop, log skip reason
in-app notification → unchanged for everyone
```

---

## Phase 1 — Foundation (schema + RPC + backfill)

**DB migration**
- Add `profiles.has_real_email boolean NOT NULL DEFAULT true`
- Add CHECK: `profiles.email IS NULL OR profiles.email NOT LIKE '%@noemail.bfclpms.local'` (real-email column never holds a synthetic)
- One-time backfill: any `auth.users.email LIKE '%@placeholder-pms.com'` OR `LIKE '%@noemail.bfclpms.local'` → set `profiles.has_real_email = false` and null out `profiles.email` if it matches the synthetic
- New table `email_change_audit (id, user_id, old_email, new_email, performed_by, performed_at, source)` — append-only, RLS: admin read all, user reads own
- Index on `lower(profiles.employee_code) WHERE is_active = true` for fast RPC lookup

**RPC** (`SECURITY DEFINER`, granted to `anon` + `authenticated`):
- `lookup_synthetic_email_by_code(p_code text) returns text` — returns synthetic email only if employee_code exists AND profile is active AND has an `auth.users` row; otherwise returns NULL (never differentiates "not found" vs "inactive" — anti-enumeration)
- Internal in-memory rate limiter via a small `auth_lookup_attempts (ip text, attempted_at timestamptz)` table + index; reject if >10/min per IP. (Edge function wrapping is option B if we want stronger control — flagged in tech notes.)

**Tests**
- Backfill correctness on mixed dataset (real / placeholder / synthetic / null email)
- RPC returns NULL for unknown / inactive / no-auth-row
- RPC returns synthetic for valid login user

**Docs**
- DOCUMENTATION.md §"Identity Model" — three user classes (real-email, no-email, profile-only)
- POLICY.md §114 — Synthetic email reservation + non-routable domain rule
- New mem: `mem://architecture/security/employee-code-login`

---

## Phase 2 — Login UX

**`src/pages/Auth.tsx`**
- Single input labelled "Email or Employee Code"
- Auto-detect: `value.includes('@')` → email path; else → call `lookup_synthetic_email_by_code` then `signInWithPassword`
- On failure → generic "Invalid credentials or inactive account" (never reveal which)
- When in code-mode: hide Google sign-in, hide "Forgot password?" link, show inline hint: *"No email on file? Contact your administrator to reset your password."*
- Preserve "Remember me" tab logic (existing memory)

**Tests**
- Email path unchanged (regression)
- Code path resolves and signs in
- Code path with wrong password shows generic error
- Google button hidden in code-mode

---

## Phase 3 — Provisioning (Password Rollout + Create-Employee + IAC bulk)

**`supabase/functions/password-rollout`**
- When `profile.email` is null/blank: mint synthetic `<sanitized_code>@noemail.bfclpms.local`, call `createUser` with `email_confirm: true`, set `profiles.has_real_email = false`
- New `auth_action` value: `'created_no_email'`
- Idempotent: re-running on a no-email user that already has auth row → just updates password (existing path)

**`supabase/functions/create-employee`**
- Replace today's `<code>@placeholder-pms.com` fallback with `<code>@noemail.bfclpms.local` AND set `has_real_email = false` on the profile row
- Keep portal_access semantics; add `has_real_email` to response

**`src/pages/admin/EmployeeMasterBackfill.tsx`**
- Allow blank email column on import; surface "X users will be created without email — they will log in via Employee Code" in preview
- Conflict rule: if existing profile has `has_real_email = true`, HR import with a *different* email raises a row-level conflict in the preview (does NOT silently overwrite)

**IAC bulk (`src/services/iac/iacService.ts` + `IdentityAccessConsole.tsx`)**
- CSV header gains optional `employee_code` column. Row valid if `email` matches an existing auth user OR `employee_code` matches an active profile
- Preview adds `no_email_user` annotation badge on rows resolving via employee_code
- Export includes both `email` and `employee_code` columns + `has_real_email` flag

**Tests**
- Password Rollout for null-email profile creates synthetic + flag
- Create-employee with blank email returns `has_real_email: false`
- IAC bulk preview accepts code-only rows
- HR import conflict on existing real-email user

---

## Phase 4 — Self-service Email Add / Change (trust-on-submit)

**New edge function `update-user-email`** (verify_jwt=false, validates in-code)
- Input: `{ new_email }`. Caller must be authenticated.
- Validate format (zod), check uniqueness against `auth.users.email` AND `profiles.email`
- Reject any `@noemail.*` value
- Call `supabaseAdmin.auth.admin.updateUserById(userId, { email: new_email, email_confirm: true })` — `email_confirm: true` skips Supabase's confirmation flow (trust-on-submit per your decision)
- Update `profiles.email = new_email`, `profiles.has_real_email = true`
- Insert `email_change_audit` row (`source: 'self_service'`, `performed_by = userId`)
- Emit `email_changed` notification (existing event in `useEmailNotificationSettings` enum)
- Return `{ success: true, email }`

**`src/pages/ProfileSettings.tsx`**
- New "Login Email" card:
  - If `has_real_email = false`: "Add your email" CTA → modal with email input + current password re-auth
  - If `has_real_email = true`: read-only display + "Change" button (same modal)
- Re-auth requirement: call `signInWithPassword` against current synthetic/real email with provided password before invoking edge function (defense in depth)
- Toast on success; clear cached profile (existing `profileCacheKeys`)

**Admin override** (in User Management): admin can set/change a user's email via existing edit flow → routed through same edge function with `source: 'admin'`, `performed_by = admin.id`

**Tests**
- Add email to no-email user → flag flips, audit row created, email_changed notification fires
- Reject duplicate email (against another auth user)
- Reject `@noemail.*` input
- Wrong current password fails before edge call

---

## Phase 5 — Dispatch & Reports Hardening

**Notification dispatch gate**
- Single helper `canSendEmail(userId): boolean` that checks `profiles.has_real_email AND profiles.email IS NOT NULL AND profiles.email NOT LIKE '%@noemail.%'`
- Apply in:
  - `process-email-queue` (drop with `skipped:no_real_email` log)
  - All cron edge functions: monthly review reminders, query reminders, observation reminders, pending-org-kpi reminders
  - `send-email-notification` direct path
  - Mention dispatch (existing batched/normal paths)
- Notification recipient guard (POLICY §108) is **unchanged** — in-app notifications still flow

**Reports & exports sweep**
- Audit Logs, User Management, IAC, Custom Reports, KRA Issuance: source email from `profiles.email` (not `auth.users.email`)
- Render "—" + "No email" badge when null
- All CSV exports add `has_real_email` column
- Report column registry (`src/lib/reportFieldRegistry.ts`) gains `has_real_email` as exportable field

**RLS audit**
- Grep for any policy referencing `auth.users.email` directly; replace with profile join if found
- Update `docs/rls-audit-report.md`

**Docs / mem**
- Update DOCUMENTATION.md identity-model section + add "Email dispatch gate" section
- Update POLICY.md §108 (recipient guard) with cross-ref to §114 (synthetic emails)
- Update `mem://architecture/security/employee-code-login` with dispatch-gate rule
- Update `mem://features/admin/non-login-user-provisioning` with new third class
- New mem: `mem://features/user/self-service-email-add`

**Tests**
- Dispatch gate drops outbound email for no-email user but lets in-app through
- All four cron jobs respect the gate
- CSV export includes `has_real_email` column with correct values

---

## Risk Register & Mitigations

| Risk | Severity | Mitigation |
|---|---|---|
| Username enumeration via lookup RPC | High | Generic failure messages + per-IP rate limit + active-only filter |
| Outbound email accidentally sent to synthetic address | High | Non-routable `.local` TLD + dispatch gate + unit test |
| Trust-on-submit lets typo'd email become contact channel | Medium | Re-auth before change + `email_change_audit` for fast rollback by admin |
| HR re-import overwrites a user-added real email | Medium | Conflict raised in EmployeeMasterBackfill preview; admin must explicitly accept |
| Lockout: no-email user forgets password | Medium | Documented admin recovery via Password Rollout; login screen surfaces the message |
| Existing reports break (read auth.users.email) | Medium | Phase 5 grep + sweep before flipping any UI defaults |
| RLS policies referencing auth email | Low | Phase 5 audit step explicitly covers this |

## Reversibility per phase
- **P1**: pure additive schema; column drop reverses
- **P2**: Auth.tsx revert-only
- **P3**: edge function revert + flag column stays (no harm)
- **P4**: feature-flag the ProfileSettings card if needed
- **P5**: dispatch gate is a single helper — easy to bypass during incident

## Files to be created / edited (high level)

**Created**
- `supabase/migrations/<ts>_employee_code_login_foundation.sql` (Phase 1)
- `supabase/functions/update-user-email/index.ts` (Phase 4)
- `src/test/employeeCodeLogin.test.ts` (Phase 1–3)
- `src/test/emailDispatchGate.test.ts` (Phase 5)
- `mem/architecture/security/employee-code-login.md`
- `mem/features/user/self-service-email-add.md`

**Edited**
- `src/pages/Auth.tsx` (P2)
- `src/pages/ProfileSettings.tsx` (P4)
- `src/pages/admin/EmployeeMasterBackfill.tsx` (P3)
- `src/pages/admin/IdentityAccessConsole.tsx` (P3)
- `src/services/iac/iacService.ts` + `types.ts` (P3)
- `src/lib/iac/csv.ts` (P3 — accept employee_code column)
- `supabase/functions/password-rollout/index.ts` (P3)
- `supabase/functions/create-employee/index.ts` (P3)
- `supabase/functions/process-email-queue/index.ts` (P5)
- All cron reminder edge functions (P5)
- `src/lib/reportFieldRegistry.ts` (P5)
- DOCUMENTATION.md, POLICY.md, mem/index.md (every phase)

---

## Suggested execution order
Confirm this plan, then I'll execute **Phase 1** in the next turn (smallest, fully reversible foundation). After verification we move to Phase 2, and so on. No phase will be merged without its tests + doc/mem updates in the same change.

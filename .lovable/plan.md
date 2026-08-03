# Block notifications and password resets for inactive employees

## Goal
An employee marked inactive (`profiles.is_active = false`) must:
1. Never receive a new in-app notification or notification email.
2. Be unable to obtain a password-reset link — neither self-service ("Forgot password") nor via the admin reset tool.

Existing records are untouched; this is forward-looking enforcement only.

## Assumptions
- `profiles.is_active = false` is the single source of truth for "inactive". Non-login profiles (no `auth.users` row) are already handled separately and stay handled.
- Deactivation itself is not being changed; only the downstream effects.
- Admins/HR keep receiving their own notifications; the rule applies to the *recipient*.

## Verified current state
- `public.notifications` INSERT policy only checks `can_send_notification_to(auth.uid(), user_id)`; that function contains no `is_active` check, so an inactive recipient is accepted.
- Most notification producers are SECURITY DEFINER triggers, which bypass RLS entirely — only the KPI-auditor trigger currently filters `is_active`. So an RLS-only fix is insufficient.
- `Auth.tsx` calls `supabase.auth.resetPasswordForEmail(...)` directly with no account-state check; the `reset-password` edge function (admin path) looks up the profile by email but does not read `is_active`.

## Risk & impact
- **Data:** No schema/data destruction. One new trigger, one function amendment, one config-free guard. Additive and reversible.
- **Workflow:** A stage assigned to an inactive reviewer will stop producing notifications. That is intended, but it can hide work — the reviewer-reassignment path stays the remedy.
- **UI/UX:** Forgot-password dialog keeps its generic anti-enumeration message; no visual redesign.
- **Regression risk:** Medium — notification inserts happen inside business transactions. Mitigated by making the recipient guard *silently skip* rather than raise, so no parent transaction ever aborts (same principle as the existing non-login recipient guard).
- **Scalability:** Guard is a single indexed primary-key lookup on `profiles` per notification row.
- **Rollback:** Drop the new trigger and revert the function body; no data migration to undo.

## Plan

### 1. Central recipient guard (database)
- Add SECURITY DEFINER helper `public.notification_recipient_is_active(uuid)` returning true when the target has an active profile (and treating unknown/absent profiles conservatively as blocked only when a profile row exists and is inactive).
- Add `BEFORE INSERT` trigger on `public.notifications` that returns `NULL` (silently drops the row) when the recipient is inactive. This covers every producer — triggers, RPCs and client inserts — without touching ~40 call sites.
- Extend `can_send_notification_to` to also return false for inactive targets, so client inserts fail fast rather than silently vanishing.

### 2. Notification emails
- Filter inactive recipients in the email path: `send-email-notification` resolves the recipient profile and returns a no-op "skipped: recipient inactive" result; the scheduled dispatchers (`send-scheduled-emails`, reminder functions) exclude inactive profiles when building their recipient sets.

### 3. Password reset — self-service
- Add a rate-limited, anti-enumeration RPC `public.password_reset_allowed(p_email text)` (SECURITY DEFINER, reuses the existing `auth_lookup_attempts` throttle pattern) that returns false for unknown or inactive accounts.
- `Auth.tsx` calls it before `resetPasswordForEmail`. If not allowed, show the *same* success screen as the happy path (no account enumeration) and skip sending.

### 4. Password reset — admin tool
- In the `reset-password` edge function, select `is_active` alongside `id` and refuse both `generate_link` and `set_password` for inactive profiles with a clear admin-facing 403 ("Employee is inactive — reactivate before resetting the password").

### 5. Governance and tests
- New ADR (`ADR-241 — Inactive employee suppression`) plus a POLICY section `§SEC-INACTIVE-SUPPRESSION`, and a DOCUMENTATION.md version-history entry.
- Tests: recipient-guard SQL assertions (trigger exists, function checks `is_active`, silent-skip semantics), an `Auth.tsx` unit test that no reset email is requested when the RPC denies, and an edge-function guard test with active/inactive fixtures.

## Verification
1. Insert a notification for an inactive recipient via a business action → row not created, business action still succeeds.
2. Same action for an active recipient → notification and email delivered as before.
3. Forgot-password with an inactive employee's email → generic success UI, no email sent, throttle recorded.
4. Admin reset for an inactive employee → blocked with explanatory error; active employee unaffected.

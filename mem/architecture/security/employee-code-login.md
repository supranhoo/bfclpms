---
name: Employee Code Login (No-Email Users)
description: Users without email log in via Employee Code; auth.users.email holds a synthetic non-routable address; profiles.has_real_email gates all outbound mail.
type: feature
---

# Employee-Code Login

A third user class (alongside login+email and profile-only): **login users without a real email**. They authenticate by Employee Code; nothing is ever delivered to their `auth.users.email`.

## Identity model
- `auth.users.email` = identity key. Real email OR synthetic `<empcode>@noemail.bfclpms.local` (reserved, non-routable `.local` TLD — no MX possible).
- `profiles.email` = real contact channel only. CHECK constraint blocks any synthetic value.
- `profiles.has_real_email boolean DEFAULT true` = single source of truth for "can receive email?".

## Login resolution
`Auth.tsx` auto-detects: input contains `@` → email path. Otherwise → `supabase.rpc('lookup_synthetic_email_by_code', { p_code, p_client_ip: null })` → `signInWithPassword(syntheticEmail, password)`. RPC is `SECURITY DEFINER`, returns NULL on any failure (anti-enumeration), rate-limited 10/min/IP via `auth_lookup_attempts`. Failure surfaces a single generic message: *"Invalid credentials or inactive account."*

## Provisioning
- `password-rollout`: when `profile.email IS NULL` → mints synthetic, sets `has_real_email=false`, audits via `email_change_audit (source='password_rollout')`. New `auth_action: 'created_no_email'`.
- `create-employee`: no-email path uses `<sanitized_code>@noemail.bfclpms.local`, profiles.email stays NULL, audits `source='create_employee'`.
- Admin Password Rollout is the **only** password-reset path for no-email users (no self-service forgot-password).

## Self-service email add (trust-on-submit)
- `update-user-profile` op `update_email`: rejects any `@noemail.*` or placeholder input, blocks duplicate addresses, sets `profiles.email`, flips `has_real_email=true`, writes `email_change_audit (source='self_service', old_email=NULL when wasSynthetic)`.
- Uses `auth.admin.updateUserById({ email_confirm: true })` — no Supabase confirmation link (per-policy decision).
- ProfileSettingsTab shows "Add Email Address" UI when `!hasRealEmail`, surfaces employee_code as the login handle.

## Dispatch gate (POLICY §114 / §108)
`send-email-notification` early-returns `skipped: no_real_email` for any recipient whose lowered address matches `@noemail.*` or `@placeholder-pms.com`. In-app notifications still flow (POLICY §108 recipient guard unchanged).

## Audit
`email_change_audit` is append-only (no UPDATE/DELETE, no INSERT policies — only SECURITY DEFINER paths write). `source ∈ {self_service, admin, system, password_rollout, create_employee}`. Admin reads all; users read their own.

## Anchor / regression rules
- NEVER store `@noemail.*` or `@placeholder-pms.com` in `profiles.email` (CHECK constraint).
- NEVER call `signInWithPassword` with a raw employee-code value — always resolve through the RPC first.
- NEVER bypass the dispatch gate; if a new email path is added, route through `send-email-notification` or replicate the gate.
- Backfill (Phase 1 migration `20260430094706_*`): 107 existing placeholder users marked `has_real_email=false`.

# Edge Function Auth Posture — Safety

## `check-safety-sla`

- **`verify_jwt` in `supabase/config.toml`:** not declared (defaults to `verify_jwt = true` in Cloud, but the function additionally accepts service-role headers for cron).
- **In-function auth:**
  - Accepts cron call (header is `Bearer <service-role>` or `apikey: <service|anon>`).
  - For user calls, validates JWT via `auth.getUser()` and checks
    `safety_user_roles.role IN ('admin','safety_head')`.
  - Returns 401 on missing/invalid JWT, 403 on missing role.
- **Caller allowlist:** pg_cron (every 5 min) + Safety admins / heads.
- **Posture:** ✅ Acceptable. **Improvement candidate:** the `apikey === anonKey` branch treats anon-key calls as service-equivalent. Recommend tightening to **service-role only** for the bypass path. → ticket `T-004-tighten-sla-anon-bypass.md`.

## `grant-safety-role`

- **`verify_jwt`:** comment in source says `verify_jwt = false`; not declared in `supabase/config.toml` (so default applies — verify in deployment dashboard).
- **In-function auth:**
  - Requires `Authorization: Bearer <user-jwt>`; validates via `auth.getUser()`.
  - Caller must be a PMS `admin` (in `user_roles`) **or** a Safety `admin` (in `safety_user_roles`).
  - Returns 401 on missing JWT, 403 on missing role.
  - Validates role in fixed allowlist `SAFETY_ROLES`.
  - Auto-provisions `auth.users` for backfilled profiles (requires real email).
- **Caller allowlist:** PMS admins + Safety admins via UI.
- **Posture:** ✅ Acceptable. **Improvement candidate:** declare
  `[functions.grant-safety-role] verify_jwt = false` explicitly in
  `supabase/config.toml` to make the in-function validation contract
  unambiguous. → ticket `T-005-declare-grant-safety-role-verify-jwt.md`.

## `safety-analytics`

- **`verify_jwt`:** not declared in `supabase/config.toml`.
- **In-function auth:**
  - Constructs a Supabase client with the **caller's** JWT (`Authorization` header).
  - Reads from `mv_safety_*` materialized views; relies on PostgREST
    GRANTs to enforce access.
- **Posture:** ⚠️ **Dependent on F-SEC-01.** Today the MVs are readable
  by authenticated callers because MVs don't carry RLS. The edge fn
  itself is fine, but the underlying data-API exposure leaks aggregates.
  → bundled with ticket `T-001-revoke-mv-safety-public-read.md`.

## Summary

- No edge function is anonymously callable in a way that mutates data.
- One real risk (`F-SEC-01` / `T-001`) — flagged for Phase 1.5.
- Two cosmetic improvements (`T-004`, `T-005`) — non-blocking.

No code changes made in this phase.
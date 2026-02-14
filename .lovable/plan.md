

# Plan: Secure Edge Functions Without Breaking Existing Flows

## Overview

Two edge functions have critical security gaps: `auto-rollover-kpis` (zero authentication) and `create-backup` (scheduled bypass). A third, `send-email-notification`, is called by database triggers and other edge functions with the service role key, so it needs a lightweight authorization check. All other functions already have proper internal auth.

## Strategy

All six functions already have `verify_jwt = false` in `config.toml` and implement their own auth validation in code. We will NOT change `config.toml` -- we will add missing auth checks directly in the function code. This avoids breaking the existing cron jobs or DB trigger calls.

## Changes

### 1. `auto-rollover-kpis/index.ts` -- Add dual auth (Bearer OR CRON_SECRET)

**Current**: No authentication whatsoever. Anyone can call it.

**Fix**: Add an auth gate at the top of the handler:
- If `Authorization: Bearer <jwt>` header is present, validate the user is an admin (same pattern used by `create-employee`, `password-rollout`, etc.)
- If `X-Cron-Secret` header is present, compare it against `Deno.env.get('CRON_SECRET')`
- If neither is valid, return 401

This ensures:
- Frontend calls (from `RolloverDialog.tsx` and `useSystemSettings.ts`) continue to work -- they already pass the user's JWT via `supabase.functions.invoke()`
- Future cron jobs work if a `CRON_SECRET` is configured and passed in the cron SQL

### 2. `create-backup/index.ts` -- Add CRON_SECRET check for scheduled backups

**Current**: Auth is only checked when `backup_type === 'manual'`. Sending `{"backup_type": "scheduled"}` bypasses all auth.

**Fix**: For `backup_type !== 'manual'` (i.e., scheduled/cron), require the `X-Cron-Secret` header and validate it against `Deno.env.get('CRON_SECRET')`. If no secret is configured or the header doesn't match, return 401.

Manual backups continue to use the existing Bearer + admin role check (no change).

### 3. `send-email-notification/index.ts` -- Add service-role check

**Current**: No auth. Called by DB triggers via `http_post` with the service role key, and by `password-rollout` with the service role key.

**Fix**: At the top of the handler, check that the `Authorization` header contains either:
- A valid service role key (matches `SUPABASE_SERVICE_ROLE_KEY`)
- Or a valid user JWT (for admin test-email calls from the frontend)

This blocks unauthenticated external callers while preserving all existing call paths.

### 4. `update-backup-schedule/index.ts` -- Update cron SQL to pass CRON_SECRET

The cron job SQL on line 101 currently passes the anon key. After changes, the cron-triggered `create-backup` will need the `CRON_SECRET` header. Update the `net.http_post` headers in the cron schedule SQL to include `X-Cron-Secret`.

### 5. `CRON_SECRET` Setup

A new secret called `CRON_SECRET` needs to be added to the project. This is a random string used to authorize cron-triggered function calls.

### 6. `DOCUMENTATION.md` -- Update

Document the new auth patterns for each edge function.

## What Does NOT Change

- `supabase/config.toml` -- no changes (all functions stay `verify_jwt = false`)
- `create-employee` -- already has Bearer + admin check
- `password-rollout` -- already has Bearer + admin check
- `update-smtp-password` -- already has Bearer + admin check
- `update-backup-schedule` -- already has Bearer + admin check
- Frontend code -- no changes needed (all frontend calls already pass JWT via `supabase.functions.invoke()`)

## Files Modified

| File | Change |
|---|---|
| `supabase/functions/auto-rollover-kpis/index.ts` | Add Bearer+admin OR CRON_SECRET auth gate |
| `supabase/functions/create-backup/index.ts` | Add CRON_SECRET check for non-manual backups |
| `supabase/functions/send-email-notification/index.ts` | Add service-role or valid-user auth check |
| `supabase/functions/update-backup-schedule/index.ts` | Update cron SQL headers to include X-Cron-Secret |
| `DOCUMENTATION.md` | Document edge function auth patterns |

## Risk Assessment

- **Zero regression risk to frontend**: All frontend calls already pass Bearer tokens via `supabase.functions.invoke()`
- **Cron jobs**: Will need the CRON_SECRET to be set as a secret AND passed in cron SQL headers. Existing cron schedules will need to be re-saved (admin can do this from the Backup Settings UI)
- **DB trigger emails**: The `send_email_on_notification` trigger already passes `Authorization: Bearer <service_role_key>` -- this will continue to work with the new service-role check


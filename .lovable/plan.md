

# RCA: Trigger Emails Still Returning 401

## Root Cause (Confirmed with Logs)

The edge function logs reveal the exact failure chain:

```
[validateCaller] SUPABASE_ANON_KEY len: 46  SERVICE_ROLE_KEY len: 41  PUBLISHABLE_KEY len: 0
[validateCaller] apikey header present but no match. apikey length: 208
[validateCaller] All auth checks failed. Bearer token length: 208
```

The DB trigger sends the **208-character publishable JWT** as both `apikey` and `Authorization` headers. The edge function has only **short internal keys** (46 and 41 chars) in its env vars -- they will never match.

The fallback code tries to read the stored 208-char key from `system_settings`, but that table has an RLS policy restricting SELECT to the `authenticated` role only. The edge function's internal client authenticates as `anon`, so the query silently returns zero rows. Auth fails.

## Fix (Two Changes)

### 1. Database Migration: Allow anon role to read system_settings

Add an RLS policy so the edge function's internal anon-role client can read the stored key:

```sql
CREATE POLICY "Allow anon to read settings"
  ON system_settings FOR SELECT TO anon USING (true);
```

This is safe because system_settings contains only configuration keys (score mode, working days, the public anon key), not sensitive secrets.

### 2. Edge Function: Use service role key for fallback client

Change the fallback `createClient` calls in `validateCaller` to prioritize `serviceRoleKey` over `anonKey`, so the client bypasses RLS automatically (belt-and-suspenders):

```text
// Line 47 and 81: change from
createClient(supabaseUrl, anonKey || serviceRoleKey!)
// to
createClient(supabaseUrl, serviceRoleKey || anonKey!)
```

### 3. Force Redeploy

Redeploy the edge function to ensure the latest code is live.

### 4. Documentation

Update DOCUMENTATION.md to note the anon-read RLS requirement for system_settings.

## Files to Modify

| File | Change |
|---|---|
| Database migration | Add `anon` SELECT policy on `system_settings` |
| `supabase/functions/send-email-notification/index.ts` | Swap key priority in fallback `createClient` calls (2 lines) |
| `DOCUMENTATION.md` | Note the RLS requirement |

## Why Test Emails Work

Test emails are sent from the frontend with the **user's JWT** (a real authenticated session token). The edge function validates this via `supabase.auth.getUser(token)` which succeeds. Only trigger-originated calls (which use the publishable key, not a user JWT) fail.

## Risk Assessment

- Very low risk -- only adds a read-only RLS policy on a config table
- No schema changes, no data changes
- Existing test email flow is unaffected


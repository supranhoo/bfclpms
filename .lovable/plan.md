

# Fix: Trigger Emails Failing — Final Root Cause and Solution

## Root Cause (Definitive)

The DB trigger sends the **208-character publishable JWT** as both the `apikey` and `Authorization` headers. The edge function's environment only has **short internal keys** (46-char anon, 41-char service role). These will never match the 208-char JWT.

The fallback code that reads the stored key from `system_settings` **silently fails** because the `catch` block at line 96 has no error logging. The `createClient` call with the 41-char internal service role key likely cannot complete the DB query in this context, and the error is swallowed.

All previous fix attempts added layers of complexity but missed the core issue: the publishable JWT is simply not available as an env var in the edge function runtime.

## Solution: Add Publishable Key as Edge Function Secret

Store the 208-char publishable JWT as a secret named `SUPABASE_PUBLISHABLE_KEY`. The existing code at lines 20-26 already checks for this env var and adds it to the `validKeys` set. Once it exists, the apikey match at line 34 will succeed immediately on the first check — no DB fallback needed.

### Step 1: Add the secret

Use the secrets tool to add `SUPABASE_PUBLISHABLE_KEY` with the value of the project's anon JWT (the 208-char key that the trigger already sends).

### Step 2: Add error logging to catch blocks

Update the silent `catch` blocks at lines 96 and 62 to log errors, so future issues are visible in logs instead of silently swallowed.

### Step 3: Redeploy the edge function

Force redeploy to pick up the new secret.

### Step 4: Update documentation

Note the required secret in DOCUMENTATION.md.

## Why This Will Work

- The trigger sends `apikey: eyJhbGci...eut4` (208 chars)
- The edge function code at line 20 reads `SUPABASE_PUBLISHABLE_KEY` from env
- Line 26 adds it to `validKeys`
- Line 34 checks `validKeys.has(apiKeyHeader)` — this will now match
- Auth succeeds on the very first check, no DB fallback needed

## Why Previous Fixes Failed

| Attempt | Why it failed |
|---|---|
| RLS policy for anon | The createClient itself fails with the 41-char internal key, so the query never executes |
| Swap key priority (serviceRoleKey first) | Same issue — the 41-char key cannot create a working client for this query |
| Silent catch blocks | Errors were swallowed, making diagnosis impossible |

## Files to Modify

| File | Change |
|---|---|
| Edge function secrets | Add `SUPABASE_PUBLISHABLE_KEY` = the 208-char anon JWT |
| `supabase/functions/send-email-notification/index.ts` | Add error logging to catch blocks (lines 62, 96) |
| `DOCUMENTATION.md` | Document the required secret |

## Risk Assessment

- Minimal risk — only adds an env var that the code already reads
- No database changes, no schema changes
- The publishable/anon key is public by design (it is the same key used in every frontend request), so storing it as a secret is safe
- Existing test email flow is completely unaffected


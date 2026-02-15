

# Fix: DB Trigger Email Calls Failing with 401 Unauthorized

## Root Cause

Every email triggered by a KPI review action is **failing with HTTP 401**. I confirmed this by checking the `net._http_response` table -- all recent calls returned status code 401.

The DB trigger `send_email_on_notification` constructs an Authorization header using:

```text
'Bearer ' || COALESCE(service_role_key, current_setting('request.jwt.claim.sub', true))
```

But `app.settings.service_role_key` is **NULL** in the database, and `request.jwt.claim.sub` is also NULL inside a trigger context. So the header becomes `Bearer null`, which the edge function rejects.

This is why:
- In-app notifications appear correctly (they are direct DB inserts)
- But no emails are sent and no email logs are created (the edge function call is rejected before it can do anything)

## Fix

Update the DB trigger function to use the **anon key** instead of the service role key for calling the edge function. Then update the edge function's `validateCaller` to also accept the anon key for trigger-originated calls.

Alternatively (and more securely), store the service role key in `app.settings` so the trigger can use it. However, the simplest and safest approach is to make the trigger pass the service role key by reading it from the `vault.secrets` table, or by hardcoding an internal shared secret.

**Recommended approach**: Update the trigger function to read `SUPABASE_SERVICE_ROLE_KEY` from `vault.decrypted_secrets` (if available) or use a dedicated app setting. Since we cannot modify vault, we will store the service role key in a new `system_settings` row and have the trigger read it from there.

### Step 1: Store Service Role Key in system_settings

Create a migration that stores the service role key so the trigger can access it. The key will be read at trigger execution time.

### Step 2: Update Trigger Function

Modify `send_email_on_notification()` to read the service role key from `system_settings` instead of relying on `app.settings`:

```text
-- Read service role key from system_settings
SELECT setting_value INTO service_role_key
FROM system_settings
WHERE setting_key = 'supabase_service_role_key';
```

### Step 3: Validate the fix

After deploying, any new KPI review will trigger an email that should now authenticate successfully (HTTP 200 instead of 401) and create an email_logs entry.

## Files to Modify

| File | Change |
|---|---|
| Database migration | 1. Insert service role key into `system_settings`. 2. Replace the trigger function to read the key from `system_settings` instead of `app.settings` |
| `DOCUMENTATION.md` | Document that the service role key must exist in system_settings for trigger-based emails to work |

## Risk Assessment

- Low risk -- only changes how the trigger reads the auth key
- No changes to the edge function itself
- No changes to any frontend code
- Existing email functionality (test emails from UI) is unaffected since those use the user's JWT token




## Fix: Remove Anonymous Read Access from `system_settings`

### Problem
The `system_settings` table has an RLS policy `Allow anon to read settings` that grants unauthenticated users full read access. This table contains SMTP configuration, email templates, API keys (anon key), and operational parameters — none of which should be publicly readable.

### Root Cause
Migration `20260215055837` added `CREATE POLICY "Allow anon to read settings" ON system_settings FOR SELECT TO anon USING (true)`. This was likely added thinking DB triggers needed it, but all triggers reading `system_settings` (`send_email_on_notification`, etc.) already run as `SECURITY DEFINER` and bypass RLS entirely.

### Why It's Safe to Remove
- All client-side reads of `system_settings` happen on authenticated admin/settings pages (`useSystemSettings`, `useEmailNotificationSettings`, `useBackups`, `EmailTemplateEditor`)
- The existing `Allow authenticated users to read settings` policy covers all legitimate use cases
- DB trigger functions use `SECURITY DEFINER` — they don't go through RLS
- The `app_settings` table (used on the login page) is a separate table with its own anon policy — unaffected

### Changes

**Database migration:**
```sql
DROP POLICY IF EXISTS "Allow anon to read settings" ON public.system_settings;
```

**`src/test/rls-policies.test.ts`:**
- Move `system_settings` from the "public tables should allow unauthenticated reads" section to the "protected tables should deny unauthenticated reads" list
- Remove the test that asserts anon can read `system_settings`

### Files Modified
- DB migration — drop the anon SELECT policy
- `src/test/rls-policies.test.ts` — update test expectations

### Risk
None. No unauthenticated code path reads `system_settings`. All DB triggers bypass RLS via `SECURITY DEFINER`.


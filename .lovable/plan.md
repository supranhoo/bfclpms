

# RLS Security Fixes

## Summary
Fix 3 overly permissive INSERT policies and tighten 2 public READ policies to require authentication.

## Changes (single database migration)

### 1. Fix "Always True" INSERT policies
Replace `WITH CHECK (true)` on these 3 tables so only service-role or admin can insert:

- **`kra_rollover_logs`**: Drop "System can insert rollover logs", replace with admin-or-service-role policy
- **`notifications`**: Drop "System can insert notifications", replace with a policy allowing:
  - Service role (for triggers/edge functions)
  - Authenticated users inserting their own notifications (where `user_id = auth.uid()`)
- **`pip_audit_logs`**: Drop "System can insert audit logs", replace with admin-or-service-role policy

### 2. Tighten public READ policies
- **`app_settings`**: Change "Anyone can read app_settings" from `USING (true)` on `public` role to `USING (true)` on `authenticated` role only
- **`workflow_settings`**: Change "Anyone can view workflow settings" from public to `authenticated` role only

### 3. Tighten profiles READ
- Review existing profiles SELECT policy; if it allows unauthenticated access, restrict to `authenticated` role

## Technical Details

All changes will be in a single SQL migration:

```sql
-- 1a. kra_rollover_logs: replace permissive INSERT
DROP POLICY IF EXISTS "System can insert rollover logs" ON kra_rollover_logs;
CREATE POLICY "Admins and service role can insert rollover logs"
  ON kra_rollover_logs FOR INSERT
  TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'));

-- 1b. notifications: replace permissive INSERT
DROP POLICY IF EXISTS "System can insert notifications" ON notifications;
CREATE POLICY "Users and service role can insert notifications"
  ON notifications FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid() OR has_role(auth.uid(), 'admin'));

-- 1c. pip_audit_logs: replace permissive INSERT
DROP POLICY IF EXISTS "System can insert audit logs" ON pip_audit_logs;
CREATE POLICY "Admins and service role can insert audit logs"
  ON pip_audit_logs FOR INSERT
  TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'));

-- 2a. app_settings: restrict to authenticated
DROP POLICY IF EXISTS "Anyone can read app_settings" ON app_settings;
CREATE POLICY "Authenticated users can read app_settings"
  ON app_settings FOR SELECT
  TO authenticated
  USING (true);

-- 2b. workflow_settings: restrict to authenticated
DROP POLICY IF EXISTS "Anyone can view workflow settings" ON workflow_settings;
CREATE POLICY "Authenticated users can view workflow settings"
  ON workflow_settings FOR SELECT
  TO authenticated
  USING (true);
```

Profiles table policy will be reviewed and tightened similarly if needed.

## Files Modified
- New SQL migration only
- `DOCUMENTATION.md` updated with security policy changes

## Risk Assessment
- **Low risk**: These are policy tightening changes only
- **Edge functions** using service role key bypass RLS entirely, so triggers/cron jobs (rollover, notifications) will continue working
- **Frontend** already requires authentication before accessing any admin pages, so restricting to `authenticated` role won't break anything


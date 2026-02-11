
-- Fix: Set view to SECURITY INVOKER (default, but explicit to satisfy linter)
ALTER VIEW public.eligible_login_users SET (security_invoker = on);

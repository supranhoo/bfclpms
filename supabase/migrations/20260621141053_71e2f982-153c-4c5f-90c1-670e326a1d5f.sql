
-- Lock down sensitive credential rows in public.system_settings.
-- Previously every authenticated user could read smtp_password, graph_client_secret, etc.

DROP POLICY IF EXISTS "Allow authenticated users to read settings" ON public.system_settings;

CREATE POLICY "Authenticated users can read non-sensitive settings"
ON public.system_settings
FOR SELECT
TO authenticated
USING (
  setting_key NOT IN (
    'smtp_password',
    'smtp_username',
    'smtp_host',
    'graph_client_secret',
    'graph_client_id',
    'graph_tenant_id',
    'supabase_anon_key',
    'supabase_service_role_key',
    'resend_api_key'
  )
  AND setting_key !~* '(password|secret|api[_-]?key|token|credential|private[_-]?key)'
);

CREATE POLICY "Admins can read all settings"
ON public.system_settings
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role));

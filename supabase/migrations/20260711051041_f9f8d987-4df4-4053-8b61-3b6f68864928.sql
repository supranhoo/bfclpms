-- Tighten cross-tenant SELECT on platform client tables
DROP POLICY IF EXISTS clients_read ON public.clients;
CREATE POLICY clients_read ON public.clients
  FOR SELECT
  USING (
    public.has_role(auth.uid(), 'platform_owner'::app_role)
    OR public.is_implementation_admin_for(id)
  );

DROP POLICY IF EXISTS cme_read ON public.client_module_entitlements;
CREATE POLICY cme_read ON public.client_module_entitlements
  FOR SELECT
  USING (
    public.has_role(auth.uid(), 'platform_owner'::app_role)
    OR public.is_implementation_admin_for(client_id)
  );

DROP POLICY IF EXISTS cae_read ON public.client_action_entitlements;
CREATE POLICY cae_read ON public.client_action_entitlements
  FOR SELECT
  USING (
    public.has_role(auth.uid(), 'platform_owner'::app_role)
    OR public.is_implementation_admin_for(client_id)
  );
-- Phase 3F: Implementation Console — Client Notification Templates
CREATE TABLE public.client_notification_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  template_key text NOT NULL,
  channel text NOT NULL DEFAULT 'email' CHECK (channel IN ('email')),
  subject text NOT NULL,
  body_text text NOT NULL,
  body_html text,
  variables jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  archived_at timestamptz,
  archived_by uuid,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT client_notification_templates_key_format CHECK (template_key ~ '^[a-z0-9_]{2,64}$'),
  CONSTRAINT client_notification_templates_subject_len CHECK (char_length(subject) BETWEEN 1 AND 200),
  CONSTRAINT client_notification_templates_body_text_len CHECK (char_length(body_text) BETWEEN 1 AND 20000),
  CONSTRAINT client_notification_templates_body_html_len CHECK (char_length(coalesce(body_html, '')) <= 50000)
);

GRANT SELECT, INSERT, UPDATE ON public.client_notification_templates TO authenticated;
GRANT ALL ON public.client_notification_templates TO service_role;

-- Unique active template_key per client (scoped per client, not global)
CREATE UNIQUE INDEX client_notification_templates_active_key_uidx
  ON public.client_notification_templates (client_id, template_key)
  WHERE is_active;

CREATE INDEX client_notification_templates_client_idx
  ON public.client_notification_templates (client_id);

ALTER TABLE public.client_notification_templates ENABLE ROW LEVEL SECURITY;

-- Reuse same predicate pattern as client_urls/client_contacts: platform_owner OR assigned implementer
CREATE POLICY "impl_console_templates_select"
  ON public.client_notification_templates FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'platform_owner'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.client_implementer_assignments cia
      WHERE cia.client_id = client_notification_templates.client_id
        AND cia.user_id = auth.uid()
    )
  );

CREATE POLICY "impl_console_templates_insert"
  ON public.client_notification_templates FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'platform_owner'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.client_implementer_assignments cia
      WHERE cia.client_id = client_notification_templates.client_id
        AND cia.user_id = auth.uid()
    )
  );

CREATE POLICY "impl_console_templates_update"
  ON public.client_notification_templates FOR UPDATE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'platform_owner'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.client_implementer_assignments cia
      WHERE cia.client_id = client_notification_templates.client_id
        AND cia.user_id = auth.uid()
    )
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'platform_owner'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.client_implementer_assignments cia
      WHERE cia.client_id = client_notification_templates.client_id
        AND cia.user_id = auth.uid()
    )
  );
-- No DELETE policy or grant: archival-only lifecycle.

CREATE TRIGGER set_client_notification_templates_updated_at
  BEFORE UPDATE ON public.client_notification_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Archive RPC: SECURITY DEFINER. Sets is_active=false, stamps archived_at/by.
CREATE OR REPLACE FUNCTION public.impl_console_archive_template(_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_client_id uuid;
BEGIN
  SELECT client_id INTO v_client_id
  FROM public.client_notification_templates
  WHERE id = _id;

  IF v_client_id IS NULL THEN
    RAISE EXCEPTION 'template_not_found';
  END IF;

  IF NOT (
    public.has_role(auth.uid(), 'platform_owner'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.client_implementer_assignments cia
      WHERE cia.client_id = v_client_id AND cia.user_id = auth.uid()
    )
  ) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  UPDATE public.client_notification_templates
  SET is_active = false,
      archived_at = now(),
      archived_by = auth.uid(),
      updated_by = auth.uid()
  WHERE id = _id;
END;
$$;

REVOKE ALL ON FUNCTION public.impl_console_archive_template(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.impl_console_archive_template(uuid) TO authenticated;
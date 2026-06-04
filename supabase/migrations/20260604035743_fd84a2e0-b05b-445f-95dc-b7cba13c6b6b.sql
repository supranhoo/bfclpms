
-- 1. Role
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'implementation_admin';

-- (commit enum addition before use)
COMMIT;
BEGIN;

-- 2. Assignments table
CREATE TABLE IF NOT EXISTS public.client_implementer_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  assigned_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id, user_id)
);
CREATE INDEX IF NOT EXISTS client_implementer_assignments_user_idx
  ON public.client_implementer_assignments(user_id);

GRANT SELECT ON public.client_implementer_assignments TO authenticated;
GRANT ALL ON public.client_implementer_assignments TO service_role;

ALTER TABLE public.client_implementer_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cia_read"
  ON public.client_implementer_assignments FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'platform_owner'::app_role) OR user_id = auth.uid());

CREATE POLICY "cia_write"
  ON public.client_implementer_assignments FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'platform_owner'::app_role))
  WITH CHECK (has_role(auth.uid(), 'platform_owner'::app_role));

-- 3. Helper
CREATE OR REPLACE FUNCTION public.is_implementation_admin_for(_client_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.client_implementer_assignments
    WHERE client_id = _client_id AND user_id = auth.uid()
  );
$$;

-- 4. SMTP config (secrets stored elsewhere; only metadata here)
CREATE TABLE IF NOT EXISTS public.client_smtp_config (
  client_id uuid PRIMARY KEY REFERENCES public.clients(id) ON DELETE CASCADE,
  from_name text,
  from_email text,
  reply_to text,
  provider text CHECK (provider IN ('smtp','resend','sendgrid','lovable')),
  smtp_host text,
  smtp_port int,
  smtp_username text,
  secret_ref text,
  secret_set_at timestamptz,
  secret_fingerprint text,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Explicit column grants — no future secret column can leak via SELECT *
GRANT SELECT (client_id, from_name, from_email, reply_to, provider,
              smtp_host, smtp_port, smtp_username, secret_ref,
              secret_set_at, secret_fingerprint, updated_by, updated_at)
  ON public.client_smtp_config TO authenticated;
GRANT INSERT, UPDATE (from_name, from_email, reply_to, provider,
                      smtp_host, smtp_port, smtp_username, updated_by, updated_at)
  ON public.client_smtp_config TO authenticated;
GRANT ALL ON public.client_smtp_config TO service_role;

ALTER TABLE public.client_smtp_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "csc_read"
  ON public.client_smtp_config FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'platform_owner'::app_role)
         OR public.is_implementation_admin_for(client_id));

CREATE POLICY "csc_write"
  ON public.client_smtp_config FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'platform_owner'::app_role)
         OR public.is_implementation_admin_for(client_id))
  WITH CHECK (has_role(auth.uid(), 'platform_owner'::app_role)
              OR public.is_implementation_admin_for(client_id));

-- 5. Setup checklist
CREATE TABLE IF NOT EXISTS public.client_setup_checklist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  item_key text NOT NULL,
  item_label text NOT NULL,
  done boolean NOT NULL DEFAULT false,
  done_by uuid,
  done_at timestamptz,
  notes text,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id, item_key)
);

GRANT SELECT, UPDATE ON public.client_setup_checklist TO authenticated;
GRANT ALL ON public.client_setup_checklist TO service_role;

ALTER TABLE public.client_setup_checklist ENABLE ROW LEVEL SECURITY;

CREATE POLICY "csl_read"
  ON public.client_setup_checklist FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'platform_owner'::app_role)
         OR public.is_implementation_admin_for(client_id));

CREATE POLICY "csl_update"
  ON public.client_setup_checklist FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'platform_owner'::app_role)
         OR public.is_implementation_admin_for(client_id))
  WITH CHECK (has_role(auth.uid(), 'platform_owner'::app_role)
              OR public.is_implementation_admin_for(client_id));

CREATE POLICY "csl_pwo_write"
  ON public.client_setup_checklist FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'platform_owner'::app_role));

-- 6. Seed defaults when a client is created
CREATE OR REPLACE FUNCTION public.seed_client_setup_checklist()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.client_setup_checklist (client_id, item_key, item_label, sort_order)
  VALUES
    (NEW.id, 'display_name',        'Confirm client display name',           10),
    (NEW.id, 'website_url',         'Set website URL',                       20),
    (NEW.id, 'allowed_app_urls',    'Configure allowed app URLs',            30),
    (NEW.id, 'support_emails',      'Set support / HR / escalation emails',  40),
    (NEW.id, 'sender_identity',     'Configure sender identity',             50),
    (NEW.id, 'smtp_secret',         'Provision SMTP / API secret',           60),
    (NEW.id, 'test_email',          'Send and verify test email',            70),
    (NEW.id, 'notification_templates','Review notification templates',       80),
    (NEW.id, 'go_live',             'Mark client ready for go-live',         90)
  ON CONFLICT (client_id, item_key) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS clients_seed_checklist ON public.clients;
CREATE TRIGGER clients_seed_checklist
  AFTER INSERT ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.seed_client_setup_checklist();

-- Backfill for existing clients
INSERT INTO public.client_setup_checklist (client_id, item_key, item_label, sort_order)
SELECT c.id, v.item_key, v.item_label, v.sort_order
FROM public.clients c
CROSS JOIN (VALUES
  ('display_name',        'Confirm client display name',           10),
  ('website_url',         'Set website URL',                       20),
  ('allowed_app_urls',    'Configure allowed app URLs',            30),
  ('support_emails',      'Set support / HR / escalation emails',  40),
  ('sender_identity',     'Configure sender identity',             50),
  ('smtp_secret',         'Provision SMTP / API secret',           60),
  ('test_email',          'Send and verify test email',            70),
  ('notification_templates','Review notification templates',       80),
  ('go_live',             'Mark client ready for go-live',         90)
) AS v(item_key, item_label, sort_order)
ON CONFLICT (client_id, item_key) DO NOTHING;

-- Touch updated_at on checklist + smtp config
CREATE OR REPLACE FUNCTION public.touch_updated_at_hub()
RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS csl_touch ON public.client_setup_checklist;
CREATE TRIGGER csl_touch BEFORE UPDATE ON public.client_setup_checklist
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at_hub();

DROP TRIGGER IF EXISTS csc_touch ON public.client_smtp_config;
CREATE TRIGGER csc_touch BEFORE UPDATE ON public.client_smtp_config
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at_hub();

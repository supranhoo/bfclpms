-- Phase 4: Report Registry + Field Sequence
CREATE TABLE public.report_registry (
  report_id text PRIMARY KEY,
  report_key text UNIQUE NOT NULL,
  module_prefix text NOT NULL,
  display_name text NOT NULL,
  canonical_route text NOT NULL,
  menu_key text,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.report_registry TO authenticated;
GRANT ALL ON public.report_registry TO service_role;
ALTER TABLE public.report_registry ENABLE ROW LEVEL SECURITY;
CREATE POLICY "report_registry read" ON public.report_registry FOR SELECT TO authenticated USING (true);
CREATE POLICY "report_registry admin write" ON public.report_registry FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.report_field_registry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id text NOT NULL REFERENCES public.report_registry(report_id) ON DELETE CASCADE,
  field_key text NOT NULL,
  default_label text NOT NULL,
  default_sort int NOT NULL,
  is_required boolean NOT NULL DEFAULT false,
  is_renamable boolean NOT NULL DEFAULT true,
  data_type text,
  UNIQUE(report_id, field_key)
);
GRANT SELECT ON public.report_field_registry TO authenticated;
GRANT ALL ON public.report_field_registry TO service_role;
ALTER TABLE public.report_field_registry ENABLE ROW LEVEL SECURITY;
CREATE POLICY "report_field_registry read" ON public.report_field_registry FOR SELECT TO authenticated USING (true);
CREATE POLICY "report_field_registry admin write" ON public.report_field_registry FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.report_field_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id text NOT NULL REFERENCES public.report_registry(report_id) ON DELETE CASCADE,
  field_key text NOT NULL,
  client_id uuid,
  custom_label text,
  custom_sort int,
  is_hidden boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX report_field_overrides_uniq
  ON public.report_field_overrides (report_id, field_key, COALESCE(client_id::text, '__global__'))
  WHERE is_active = true;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.report_field_overrides TO authenticated;
GRANT ALL ON public.report_field_overrides TO service_role;
ALTER TABLE public.report_field_overrides ENABLE ROW LEVEL SECURITY;
CREATE POLICY "report_field_overrides read" ON public.report_field_overrides FOR SELECT TO authenticated USING (true);
CREATE POLICY "report_field_overrides admin write" ON public.report_field_overrides FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.report_field_override_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id text NOT NULL,
  field_key text,
  client_id uuid,
  field text NOT NULL,
  old_value text,
  new_value text,
  changed_by uuid,
  changed_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.report_field_override_audit TO authenticated;
GRANT ALL ON public.report_field_override_audit TO service_role;
ALTER TABLE public.report_field_override_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY "report_field_override_audit admin read" ON public.report_field_override_audit FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "report_field_override_audit insert" ON public.report_field_override_audit FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Validation trigger: cannot hide a required field; sort >= 0
CREATE OR REPLACE FUNCTION public.report_field_overrides_validate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  reg public.report_field_registry%ROWTYPE;
BEGIN
  SELECT * INTO reg FROM public.report_field_registry
    WHERE report_id = NEW.report_id AND field_key = NEW.field_key;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unknown report field: % / %', NEW.report_id, NEW.field_key;
  END IF;
  IF NEW.is_hidden AND reg.is_required THEN
    RAISE EXCEPTION 'Field % is required and cannot be hidden', NEW.field_key;
  END IF;
  IF NEW.custom_sort IS NOT NULL AND NEW.custom_sort < 0 THEN
    RAISE EXCEPTION 'custom_sort must be >= 0';
  END IF;
  IF NEW.custom_label IS NOT NULL AND NOT reg.is_renamable THEN
    RAISE EXCEPTION 'Field % is not renamable', NEW.field_key;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER report_field_overrides_validate_trg
BEFORE INSERT OR UPDATE ON public.report_field_overrides
FOR EACH ROW EXECUTE FUNCTION public.report_field_overrides_validate();

-- Seed master switch
INSERT INTO public.system_settings (setting_key, setting_value, description)
VALUES ('report_overrides_enabled', '"false"'::jsonb, 'Master switch for report field sequence overrides')
ON CONFLICT (setting_key) DO NOTHING;
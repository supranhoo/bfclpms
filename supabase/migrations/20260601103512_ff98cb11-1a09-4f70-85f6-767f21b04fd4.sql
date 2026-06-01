-- 1) Definitions table
CREATE TABLE public.employee_master_custom_fields (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  field_key text NOT NULL UNIQUE,
  field_label text NOT NULL,
  field_type text NOT NULL CHECK (field_type IN ('text','number','date','dropdown','yes_no','email','phone','long_text')),
  is_mandatory boolean NOT NULL DEFAULT false,
  show_on_add_user boolean NOT NULL DEFAULT true,
  show_on_edit_user boolean NOT NULL DEFAULT true,
  show_in_employee_master boolean NOT NULL DEFAULT false,
  dropdown_options jsonb,
  placeholder text,
  help_text text,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT employee_master_custom_fields_field_key_format CHECK (field_key ~ '^[a-z][a-z0-9_]{1,40}$')
);

GRANT SELECT ON public.employee_master_custom_fields TO authenticated;
GRANT ALL ON public.employee_master_custom_fields TO service_role;

ALTER TABLE public.employee_master_custom_fields ENABLE ROW LEVEL SECURITY;

CREATE POLICY "emcf_select_authenticated"
  ON public.employee_master_custom_fields FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "emcf_admin_insert"
  ON public.employee_master_custom_fields FOR INSERT
  TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "emcf_admin_update"
  ON public.employee_master_custom_fields FOR UPDATE
  TO authenticated USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "emcf_admin_delete"
  ON public.employee_master_custom_fields FOR DELETE
  TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_employee_master_custom_fields_updated_at
  BEFORE UPDATE ON public.employee_master_custom_fields
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_emcf_active_sort ON public.employee_master_custom_fields (is_active, sort_order, field_label);

-- 2) Values table (one JSONB row per employee)
CREATE TABLE public.employee_master_custom_field_values (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  values jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT employee_master_custom_field_values_employee_unique UNIQUE (employee_id)
);

GRANT SELECT ON public.employee_master_custom_field_values TO authenticated;
GRANT ALL ON public.employee_master_custom_field_values TO service_role;

ALTER TABLE public.employee_master_custom_field_values ENABLE ROW LEVEL SECURITY;

CREATE POLICY "emcfv_select_authenticated"
  ON public.employee_master_custom_field_values FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "emcfv_admin_insert"
  ON public.employee_master_custom_field_values FOR INSERT
  TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "emcfv_admin_update"
  ON public.employee_master_custom_field_values FOR UPDATE
  TO authenticated USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "emcfv_admin_delete"
  ON public.employee_master_custom_field_values FOR DELETE
  TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_employee_master_custom_field_values_updated_at
  BEFORE UPDATE ON public.employee_master_custom_field_values
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_emcfv_values_gin ON public.employee_master_custom_field_values USING GIN (values);
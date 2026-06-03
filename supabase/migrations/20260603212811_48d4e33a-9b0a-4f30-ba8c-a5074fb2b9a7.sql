CREATE TABLE public.sensitive_fields (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module_key text NOT NULL,
  table_name text NOT NULL,
  column_name text NOT NULL,
  field_label text,
  classification_key text NOT NULL REFERENCES public.data_classifications(classification_key),
  pii boolean NOT NULL DEFAULT false,
  phi boolean NOT NULL DEFAULT false,
  financial boolean NOT NULL DEFAULT false,
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_by uuid,
  CONSTRAINT sensitive_fields_unique_key UNIQUE (module_key, table_name, column_name)
);

GRANT SELECT ON public.sensitive_fields TO authenticated;
GRANT ALL ON public.sensitive_fields TO service_role;

ALTER TABLE public.sensitive_fields ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sensitive_fields_read_authenticated"
  ON public.sensitive_fields FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "sensitive_fields_write_platform_owner"
  ON public.sensitive_fields FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'platform_owner'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'platform_owner'::app_role));

CREATE TRIGGER sensitive_fields_set_updated_at
  BEFORE UPDATE ON public.sensitive_fields
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX sensitive_fields_module_idx ON public.sensitive_fields(module_key);
CREATE INDEX sensitive_fields_classification_idx ON public.sensitive_fields(classification_key);
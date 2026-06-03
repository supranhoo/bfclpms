CREATE TABLE public.export_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  classification_key text NOT NULL UNIQUE REFERENCES public.data_classifications(classification_key),
  export_allowed boolean NOT NULL DEFAULT true,
  allowed_formats text[] NOT NULL DEFAULT ARRAY['csv','xlsx','pdf']::text[],
  max_rows_per_export integer,
  watermark_required boolean NOT NULL DEFAULT false,
  download_reason_required boolean NOT NULL DEFAULT false,
  approval_required boolean NOT NULL DEFAULT false,
  approver_role text,
  retain_export_log_days integer,
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_by uuid,
  CONSTRAINT export_policies_max_rows_nonneg CHECK (max_rows_per_export IS NULL OR max_rows_per_export >= 0),
  CONSTRAINT export_policies_retain_days_nonneg CHECK (retain_export_log_days IS NULL OR retain_export_log_days >= 0)
);

GRANT SELECT ON public.export_policies TO authenticated;
GRANT ALL ON public.export_policies TO service_role;

ALTER TABLE public.export_policies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "export_policies_read_authenticated"
  ON public.export_policies FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "export_policies_write_platform_owner"
  ON public.export_policies FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'platform_owner'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'platform_owner'::app_role));

CREATE TRIGGER export_policies_set_updated_at
  BEFORE UPDATE ON public.export_policies
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed: one row per existing classification, defaults derived from the classification's own flags.
INSERT INTO public.export_policies (
  classification_key,
  export_allowed,
  allowed_formats,
  max_rows_per_export,
  watermark_required,
  download_reason_required,
  approval_required,
  approver_role,
  retain_export_log_days,
  is_active
)
SELECT
  dc.classification_key,
  dc.export_allowed,
  CASE WHEN dc.export_allowed THEN ARRAY['csv','xlsx','pdf']::text[] ELSE ARRAY[]::text[] END,
  dc.max_rows_allowed,
  dc.watermark_required,
  dc.download_reason_required,
  dc.approval_required,
  CASE WHEN dc.approval_required THEN 'platform_owner' ELSE NULL END,
  NULL,
  true
FROM public.data_classifications dc
ON CONFLICT (classification_key) DO NOTHING;
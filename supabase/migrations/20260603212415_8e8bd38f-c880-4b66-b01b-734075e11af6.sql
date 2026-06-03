-- 1. Create the table.
CREATE TABLE public.data_classifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  classification_key text NOT NULL UNIQUE,
  label text NOT NULL,
  description text,
  sort_order integer NOT NULL DEFAULT 0,
  export_allowed boolean NOT NULL DEFAULT true,
  watermark_required boolean NOT NULL DEFAULT false,
  download_reason_required boolean NOT NULL DEFAULT false,
  approval_required boolean NOT NULL DEFAULT false,
  max_rows_allowed integer,
  audit_view_required boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Grants (Data API needs explicit grants on public schema).
GRANT SELECT ON public.data_classifications TO authenticated;
GRANT INSERT, UPDATE ON public.data_classifications TO authenticated;
GRANT ALL ON public.data_classifications TO service_role;

-- 3. RLS.
ALTER TABLE public.data_classifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY data_classifications_read
  ON public.data_classifications
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY data_classifications_write
  ON public.data_classifications
  FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'platform_owner'::app_role))
  WITH CHECK (has_role(auth.uid(), 'platform_owner'::app_role));

-- 4. Reuse existing hub touch trigger for updated_at.
CREATE TRIGGER data_classifications_touch
  BEFORE UPDATE ON public.data_classifications
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at_hub();

-- 5. Seed the 5 default tiers (safe defaults: stricter rules as you go up).
INSERT INTO public.data_classifications
  (classification_key, label, description, sort_order,
   export_allowed, watermark_required, download_reason_required,
   approval_required, max_rows_allowed, audit_view_required, is_active)
VALUES
  ('public', 'Public', 'Non-sensitive data that may be shared freely.',
    10, true,  false, false, false, NULL,   false, true),
  ('internal', 'Internal', 'For employees only; not for external distribution.',
    20, true,  false, false, false, 100000, false, true),
  ('confidential', 'Confidential', 'Sensitive business data; export with caution.',
    30, true,  true,  true,  false, 10000,  true,  true),
  ('highly_confidential', 'Highly Confidential', 'Performance, compensation and review-stage data; restricted access.',
    40, true,  true,  true,  true,  1000,   true,  true),
  ('restricted', 'Restricted', 'Highest sensitivity; export blocked by default.',
    50, false, true,  true,  true,  0,      true,  true);
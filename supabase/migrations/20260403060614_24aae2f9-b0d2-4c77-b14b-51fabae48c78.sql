
-- Create companies table
CREATE TABLE public.companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  code TEXT,
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

-- RLS: authenticated can read, admins can write
CREATE POLICY "Authenticated users can read companies"
  ON public.companies FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Admins can manage companies"
  ON public.companies FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Add company_id to org structure tables
ALTER TABLE public.divisions ADD COLUMN company_id UUID REFERENCES public.companies(id);
ALTER TABLE public.designations ADD COLUMN company_id UUID REFERENCES public.companies(id);
ALTER TABLE public.pms_grades ADD COLUMN company_id UUID REFERENCES public.companies(id);
ALTER TABLE public.levels ADD COLUMN company_id UUID REFERENCES public.companies(id);

-- Create a default company from system_settings if exists, otherwise create a placeholder
DO $$
DECLARE
  v_company_name TEXT;
  v_company_id UUID;
BEGIN
  SELECT (setting_value #>> '{}') INTO v_company_name
  FROM public.system_settings
  WHERE setting_key = 'company_name';

  IF v_company_name IS NULL OR v_company_name = '' THEN
    v_company_name := 'Default Company';
  END IF;

  INSERT INTO public.companies (name, is_default)
  VALUES (v_company_name, true)
  RETURNING id INTO v_company_id;

  -- Backfill existing records
  UPDATE public.divisions SET company_id = v_company_id WHERE company_id IS NULL;
  UPDATE public.designations SET company_id = v_company_id WHERE company_id IS NULL;
  UPDATE public.pms_grades SET company_id = v_company_id WHERE company_id IS NULL;
  UPDATE public.levels SET company_id = v_company_id WHERE company_id IS NULL;
END $$;

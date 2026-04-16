
-- Create custom_reports table
CREATE TABLE public.custom_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  icon TEXT NOT NULL DEFAULT 'FileText',
  color TEXT NOT NULL DEFAULT 'text-primary',
  category TEXT DEFAULT 'Custom',
  columns JSONB NOT NULL DEFAULT '[]'::jsonb,
  filters JSONB NOT NULL DEFAULT '[]'::jsonb,
  default_sort JSONB,
  group_by TEXT,
  export_excel BOOLEAN NOT NULL DEFAULT true,
  export_pdf BOOLEAN NOT NULL DEFAULT false,
  filename_template TEXT,
  view_roles TEXT[] NOT NULL DEFAULT ARRAY['admin']::text[],
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.custom_reports ENABLE ROW LEVEL SECURITY;

-- Admins can do everything
CREATE POLICY "Admins can manage custom reports"
ON public.custom_reports FOR ALL TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
);

-- All authenticated users can read active reports where their role is in view_roles
CREATE POLICY "Users can view active reports matching their roles"
ON public.custom_reports FOR SELECT TO authenticated
USING (
  is_active = true
  AND EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role::text = ANY(view_roles)
  )
);

-- Trigger for updated_at
CREATE TRIGGER update_custom_reports_updated_at
  BEFORE UPDATE ON public.custom_reports
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

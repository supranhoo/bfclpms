
CREATE TABLE public.incentive_program_custom_tabs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id UUID NOT NULL REFERENCES incentive_programs(id) ON DELETE CASCADE,
  tab_key TEXT NOT NULL,
  tab_label TEXT NOT NULL,
  sort_order INT DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  fields JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(program_id, tab_key)
);
ALTER TABLE public.incentive_program_custom_tabs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth users manage custom tabs" ON public.incentive_program_custom_tabs
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.incentive_custom_tab_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tab_id UUID NOT NULL REFERENCES incentive_program_custom_tabs(id) ON DELETE CASCADE,
  program_id UUID NOT NULL REFERENCES incentive_programs(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  field_values JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tab_id, employee_id)
);
ALTER TABLE public.incentive_custom_tab_data ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth users manage custom tab data" ON public.incentive_custom_tab_data
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

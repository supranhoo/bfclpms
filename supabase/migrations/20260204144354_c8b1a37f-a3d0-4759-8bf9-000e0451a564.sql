-- 1. Create org_kpi_data_owners table
CREATE TABLE public.org_kpi_data_owners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID NOT NULL REFERENCES kra_categories(id) ON DELETE CASCADE,
  kra_name TEXT NOT NULL,
  kpi_name TEXT NOT NULL,
  owner_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  assigned_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(category_id, kra_name, kpi_name, owner_id)
);

-- 2. Add status columns to org_kpi_values
ALTER TABLE public.org_kpi_values
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'approved',
  ADD COLUMN IF NOT EXISTS sent_back_by UUID REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS sent_back_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sent_back_reason TEXT,
  ADD COLUMN IF NOT EXISTS submission_count INTEGER DEFAULT 1;

-- 3. Enable RLS on new table
ALTER TABLE public.org_kpi_data_owners ENABLE ROW LEVEL SECURITY;

-- 4. RLS policies for org_kpi_data_owners
CREATE POLICY "Authenticated users can read org_kpi_data_owners"
  ON public.org_kpi_data_owners FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Admins can manage org_kpi_data_owners"
  ON public.org_kpi_data_owners FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 5. Add RLS policy for data owners to update their assigned org_kpi_values
CREATE POLICY "Data owners can update their assigned org_kpi_values"
  ON public.org_kpi_values FOR UPDATE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin') OR
    EXISTS (
      SELECT 1 FROM public.org_kpi_data_owners
      WHERE org_kpi_data_owners.category_id = org_kpi_values.category_id
        AND org_kpi_data_owners.kra_name = org_kpi_values.kra_name
        AND org_kpi_data_owners.kpi_name = org_kpi_values.kpi_name
        AND org_kpi_data_owners.owner_id = auth.uid()
    )
  );

-- 6. Add RLS policy for data owners to insert org_kpi_values
CREATE POLICY "Data owners can insert their assigned org_kpi_values"
  ON public.org_kpi_values FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin') OR
    EXISTS (
      SELECT 1 FROM public.org_kpi_data_owners
      WHERE org_kpi_data_owners.category_id = org_kpi_values.category_id
        AND org_kpi_data_owners.kra_name = org_kpi_values.kra_name
        AND org_kpi_data_owners.kpi_name = org_kpi_values.kpi_name
        AND org_kpi_data_owners.owner_id = auth.uid()
    )
  );
-- Create observation_type enum
CREATE TYPE observation_type AS ENUM ('positive', 'concern', 'neutral');

-- Create kpi_observations table
CREATE TABLE kpi_observations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kpi_id uuid NOT NULL REFERENCES kpis(id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES profiles(id),
  observer_role text NOT NULL CHECK (observer_role IN ('self', 'manager', 'auditor', 'management', 'admin')),
  observation_type observation_type NOT NULL DEFAULT 'neutral',
  score_impact integer NOT NULL DEFAULT 0 CHECK (score_impact >= -5 AND score_impact <= 5),
  title text NOT NULL,
  description text,
  evidence_url text,
  is_applied boolean NOT NULL DEFAULT false,
  reviewed_by uuid REFERENCES profiles(id),
  reviewed_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- Enable RLS
ALTER TABLE kpi_observations ENABLE ROW LEVEL SECURITY;

-- RLS: Users can view observations for KPIs they can access
CREATE POLICY "Users can view observations for accessible KPIs"
  ON kpi_observations FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM kpis 
      WHERE kpis.id = kpi_observations.kpi_id
      AND (
        kpis.employee_id = auth.uid() OR
        EXISTS (SELECT 1 FROM profiles WHERE id = kpis.employee_id AND reporting_manager_id = auth.uid()) OR
        has_role(auth.uid(), 'admin') OR
        has_role(auth.uid(), 'auditor') OR
        has_role(auth.uid(), 'management')
      )
    )
  );

-- RLS: Self can create observations for their own KPIs, reviewers for accessible KPIs
CREATE POLICY "Users can create observations"
  ON kpi_observations FOR INSERT
  TO authenticated
  WITH CHECK (
    created_by = auth.uid() AND (
      EXISTS (
        SELECT 1 FROM kpis WHERE kpis.id = kpi_id AND kpis.employee_id = auth.uid()
      ) OR
      has_role(auth.uid(), 'manager') OR
      has_role(auth.uid(), 'auditor') OR
      has_role(auth.uid(), 'management') OR
      has_role(auth.uid(), 'admin')
    )
  );

-- RLS: Creator or admin can update their observations
CREATE POLICY "Users can update own observations"
  ON kpi_observations FOR UPDATE
  TO authenticated
  USING (
    created_by = auth.uid() OR
    has_role(auth.uid(), 'admin') OR
    has_role(auth.uid(), 'management')
  )
  WITH CHECK (
    created_by = auth.uid() OR
    has_role(auth.uid(), 'admin') OR
    has_role(auth.uid(), 'management')
  );

-- RLS: Creator or admin can delete their observations
CREATE POLICY "Users can delete own observations"
  ON kpi_observations FOR DELETE
  TO authenticated
  USING (
    created_by = auth.uid() OR
    has_role(auth.uid(), 'admin')
  );

-- Create indexes for performance
CREATE INDEX idx_kpi_observations_kpi_id ON kpi_observations(kpi_id);
CREATE INDEX idx_kpi_observations_created_by ON kpi_observations(created_by);

-- Create trigger for updated_at
CREATE TRIGGER update_kpi_observations_updated_at
  BEFORE UPDATE ON kpi_observations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
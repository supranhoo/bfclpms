
-- Table 1: Employee Job Descriptions (designation-based)
CREATE TABLE public.employee_job_descriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  designation text NOT NULL,
  role_purpose text,
  key_responsibilities jsonb DEFAULT '[]'::jsonb,
  required_skills jsonb DEFAULT '[]'::jsonb,
  qualifications text,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(designation)
);

ALTER TABLE public.employee_job_descriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage job descriptions"
  ON public.employee_job_descriptions FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Authenticated users can view job descriptions"
  ON public.employee_job_descriptions FOR SELECT
  TO authenticated
  USING (true);

-- Table 2: Skill Competencies (per employee)
CREATE TABLE public.skill_competencies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL,
  skill_name text NOT NULL,
  category text,
  required_level integer DEFAULT 1,
  current_level integer DEFAULT 1,
  assessed_by uuid,
  assessed_at timestamp with time zone,
  review_year integer,
  review_period text,
  remarks text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.skill_competencies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Employees can view own competencies"
  ON public.skill_competencies FOR SELECT
  TO authenticated
  USING (employee_id = auth.uid());

CREATE POLICY "Managers can view team competencies"
  ON public.skill_competencies FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = skill_competencies.employee_id
    AND p.reporting_manager_id = auth.uid()
  ));

CREATE POLICY "Managers can update team competencies"
  ON public.skill_competencies FOR UPDATE
  TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = skill_competencies.employee_id
      AND p.reporting_manager_id = auth.uid()
    )
  );

CREATE POLICY "Managers can insert team competencies"
  ON public.skill_competencies FOR INSERT
  TO authenticated
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'manager'::app_role)
  );

CREATE POLICY "Admins have full access to competencies"
  ON public.skill_competencies FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Management can view all competencies"
  ON public.skill_competencies FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'management'::app_role));

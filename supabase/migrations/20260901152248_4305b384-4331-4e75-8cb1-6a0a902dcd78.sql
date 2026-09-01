CREATE TABLE public.kpi_title_backfill_2026_09 (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kpi_id uuid NOT NULL,
  employee_id uuid,
  review_period text,
  review_year integer,
  kra_name text,
  kpi_name text,
  old_kpi_title text,
  old_kpi_description text,
  old_kpi_formula text,
  old_kpi_scoring_logic text,
  old_kpi_definition_id uuid,
  new_kpi_title text,
  new_kpi_definition_id uuid,
  source_kpi_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.kpi_title_backfill_2026_09 TO authenticated;
GRANT ALL ON public.kpi_title_backfill_2026_09 TO service_role;

ALTER TABLE public.kpi_title_backfill_2026_09 ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read the title backfill archive"
  ON public.kpi_title_backfill_2026_09 FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_kpi_title_backfill_2026_09_kpi ON public.kpi_title_backfill_2026_09(kpi_id);
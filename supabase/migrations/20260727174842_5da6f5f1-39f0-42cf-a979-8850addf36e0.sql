-- 1. Audit table for the ADR-187 final-score repair
CREATE TABLE public.annual_review_final_score_repair_2026_07 (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id uuid NOT NULL,
  employee_id uuid,
  employee_code text,
  employee_name text,
  template_id uuid,
  old_criteria_weighted_score numeric,
  new_criteria_weighted_score numeric,
  old_total_score numeric,
  new_total_score numeric,
  old_final_rating text,
  new_final_rating text,
  reason text NOT NULL,
  performed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.annual_review_final_score_repair_2026_07 TO authenticated;
GRANT ALL ON public.annual_review_final_score_repair_2026_07 TO service_role;

ALTER TABLE public.annual_review_final_score_repair_2026_07 ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ar_fs_repair_admin_read"
  ON public.annual_review_final_score_repair_2026_07
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 2. Scale invariant: total_score must be a 0..100 normalised value, and a
--    completed instance carrying a score must always carry a rating band.
--    POLICY §AR-FINAL-SCORE-SCALE-INVARIANT (ADR-187)
CREATE OR REPLACE FUNCTION public.tg_ar_total_score_scale()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.total_score IS NOT NULL AND (NEW.total_score < 0 OR NEW.total_score > 100) THEN
    RAISE EXCEPTION
      'annual_review_instances.total_score must be normalised to 0..100 (got %). Use annual_review_compute_final_summary() — never write the raw weighted criteria sum. See POLICY §AR-FINAL-SCORE-SCALE-INVARIANT.',
      NEW.total_score
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.overall_status = 'completed'
     AND NEW.total_score IS NOT NULL
     AND COALESCE(NEW.final_rating, '') = '' THEN
    NEW.final_rating := public.annual_review_resolve_final_rating(NEW.total_score);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ar_total_score_scale ON public.annual_review_instances;
CREATE TRIGGER trg_ar_total_score_scale
  BEFORE INSERT OR UPDATE OF total_score, final_rating, overall_status
  ON public.annual_review_instances
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_ar_total_score_scale();
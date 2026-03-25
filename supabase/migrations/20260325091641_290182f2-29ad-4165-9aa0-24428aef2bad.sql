
-- Score range validation + auto-rating trigger (runs BEFORE INSERT OR UPDATE)
CREATE OR REPLACE FUNCTION public.auto_compute_rating_and_clamp_scores()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  -- Clamp all score fields to 0-5 range
  IF NEW.self_score IS NOT NULL THEN
    NEW.self_score := LEAST(5, GREATEST(0, NEW.self_score));
    NEW.self_rating := (CASE WHEN ROUND(NEW.self_score)>=5 THEN 'blue' WHEN ROUND(NEW.self_score)>=4 THEN 'green' WHEN ROUND(NEW.self_score)>=3 THEN 'yellow' ELSE 'red' END)::rating_level;
  END IF;

  IF NEW.manager_score IS NOT NULL THEN
    NEW.manager_score := LEAST(5, GREATEST(0, NEW.manager_score));
    NEW.manager_rating := (CASE WHEN ROUND(NEW.manager_score)>=5 THEN 'blue' WHEN ROUND(NEW.manager_score)>=4 THEN 'green' WHEN ROUND(NEW.manager_score)>=3 THEN 'yellow' ELSE 'red' END)::rating_level;
  END IF;

  IF NEW.skip_level_score IS NOT NULL THEN
    NEW.skip_level_score := LEAST(5, GREATEST(0, NEW.skip_level_score));
    NEW.skip_level_rating := (CASE WHEN ROUND(NEW.skip_level_score)>=5 THEN 'blue' WHEN ROUND(NEW.skip_level_score)>=4 THEN 'green' WHEN ROUND(NEW.skip_level_score)>=3 THEN 'yellow' ELSE 'red' END)::rating_level;
  END IF;

  IF NEW.hr_pms_score IS NOT NULL THEN
    NEW.hr_pms_score := LEAST(5, GREATEST(0, NEW.hr_pms_score));
    NEW.hr_pms_rating := (CASE WHEN ROUND(NEW.hr_pms_score)>=5 THEN 'blue' WHEN ROUND(NEW.hr_pms_score)>=4 THEN 'green' WHEN ROUND(NEW.hr_pms_score)>=3 THEN 'yellow' ELSE 'red' END)::rating_level;
  END IF;

  IF NEW.auditor_score IS NOT NULL THEN
    NEW.auditor_score := LEAST(5, GREATEST(0, NEW.auditor_score));
    NEW.auditor_rating := (CASE WHEN ROUND(NEW.auditor_score)>=5 THEN 'blue' WHEN ROUND(NEW.auditor_score)>=4 THEN 'green' WHEN ROUND(NEW.auditor_score)>=3 THEN 'yellow' ELSE 'red' END)::rating_level;
  END IF;

  IF NEW.management_score IS NOT NULL THEN
    NEW.management_score := LEAST(5, GREATEST(0, NEW.management_score));
    NEW.management_rating := (CASE WHEN ROUND(NEW.management_score)>=5 THEN 'blue' WHEN ROUND(NEW.management_score)>=4 THEN 'green' WHEN ROUND(NEW.management_score)>=3 THEN 'yellow' ELSE 'red' END)::rating_level;
  END IF;

  IF NEW.final_score IS NOT NULL THEN
    NEW.final_score := LEAST(5, GREATEST(0, NEW.final_score));
    NEW.final_rating := (CASE WHEN ROUND(NEW.final_score)>=5 THEN 'blue' WHEN ROUND(NEW.final_score)>=4 THEN 'green' WHEN ROUND(NEW.final_score)>=3 THEN 'yellow' ELSE 'red' END)::rating_level;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_auto_compute_rating_and_clamp
BEFORE INSERT OR UPDATE ON review_submissions
FOR EACH ROW EXECUTE FUNCTION public.auto_compute_rating_and_clamp_scores();

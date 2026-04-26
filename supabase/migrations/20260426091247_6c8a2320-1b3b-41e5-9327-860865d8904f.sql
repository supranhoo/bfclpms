-- BUG-036 / POLICY §107 — Reviewer Self-Exclusion (DB safety net)
-- Block any write that sets profiles.reporting_manager_id = profiles.id
-- so the reviewer can never appear in their own direct-reports / skip-level list.

CREATE OR REPLACE FUNCTION public.prevent_self_reporting_manager()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.reporting_manager_id IS NOT NULL AND NEW.reporting_manager_id = NEW.id THEN
    RAISE EXCEPTION 'An employee cannot report to themselves (profiles.reporting_manager_id must differ from profiles.id).'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_self_reporting_manager ON public.profiles;
CREATE TRIGGER trg_prevent_self_reporting_manager
  BEFORE INSERT OR UPDATE OF reporting_manager_id ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_self_reporting_manager();
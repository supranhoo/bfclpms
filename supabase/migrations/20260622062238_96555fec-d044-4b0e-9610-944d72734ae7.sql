CREATE OR REPLACE FUNCTION public.guard_observation_self_edit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  -- Only enforce restriction when the author is the one updating
  IF auth.uid() = OLD.created_by THEN
    -- Hard-locked fields for the creator (workflow / immutable / evidence)
    IF NEW.kpi_id           IS DISTINCT FROM OLD.kpi_id
       OR NEW.created_by    IS DISTINCT FROM OLD.created_by
       OR NEW.created_at    IS DISTINCT FROM OLD.created_at
       OR NEW.observer_role IS DISTINCT FROM OLD.observer_role
       OR NEW.observation_type IS DISTINCT FROM OLD.observation_type
       OR NEW.score_impact  IS DISTINCT FROM OLD.score_impact
       OR NEW.is_applied    IS DISTINCT FROM OLD.is_applied
       OR NEW.visibility    IS DISTINCT FROM OLD.visibility
       OR NEW.ticket_number IS DISTINCT FROM OLD.ticket_number
       OR NEW.reviewed_by   IS DISTINCT FROM OLD.reviewed_by
       OR NEW.reviewed_at   IS DISTINCT FROM OLD.reviewed_at
       OR COALESCE(NEW.evidence_urls::text,'') IS DISTINCT FROM COALESCE(OLD.evidence_urls::text,'')
       OR COALESCE(NEW.evidence_url,'')        IS DISTINCT FROM COALESCE(OLD.evidence_url,'') THEN
      RAISE EXCEPTION 'Only title/description may be edited on an observation';
    END IF;

    -- Status: allow the raiser to toggle their own observation between open <-> resolved
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      IF NOT (
        (OLD.status = 'open'     AND NEW.status = 'resolved') OR
        (OLD.status = 'resolved' AND NEW.status = 'open')
      ) THEN
        RAISE EXCEPTION 'Raiser may only mark an observation resolved or reopen it';
      END IF;
    END IF;

    -- edited_at bump on text changes
    IF NEW.title       IS DISTINCT FROM OLD.title
       OR NEW.description IS DISTINCT FROM OLD.description THEN
      NEW.edited_at := now();
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- 1) Additive columns
ALTER TABLE public.kpi_observation_replies
  ADD COLUMN IF NOT EXISTS edited_at timestamptz;

ALTER TABLE public.kpi_observations
  ADD COLUMN IF NOT EXISTS edited_at timestamptz;

-- 2) RLS UPDATE policy: reply author can edit own reply within 24h
DROP POLICY IF EXISTS "Authors can edit own reply within 24h" ON public.kpi_observation_replies;
CREATE POLICY "Authors can edit own reply within 24h"
  ON public.kpi_observation_replies
  FOR UPDATE TO authenticated
  USING (auth.uid() = reply_by AND created_at > now() - interval '24 hours')
  WITH CHECK (auth.uid() = reply_by AND created_at > now() - interval '24 hours');

-- 3) RLS UPDATE policy: observation author can edit own observation within 24h
DROP POLICY IF EXISTS "Authors can edit own observation within 24h" ON public.kpi_observations;
CREATE POLICY "Authors can edit own observation within 24h"
  ON public.kpi_observations
  FOR UPDATE TO authenticated
  USING (auth.uid() = created_by AND created_at > now() - interval '24 hours')
  WITH CHECK (auth.uid() = created_by AND created_at > now() - interval '24 hours');

-- 4) Guard trigger for replies: only reply_text + edited_at may change
CREATE OR REPLACE FUNCTION public.guard_observation_reply_edit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Allow service_role / admin bypass: nothing to guard
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  -- If this is a self-edit by the author, only reply_text + edited_at may change
  IF auth.uid() = OLD.reply_by THEN
    IF NEW.observation_id IS DISTINCT FROM OLD.observation_id
       OR NEW.reply_by      IS DISTINCT FROM OLD.reply_by
       OR NEW.created_at    IS DISTINCT FROM OLD.created_at
       OR COALESCE(NEW.evidence_urls::text,'') IS DISTINCT FROM COALESCE(OLD.evidence_urls::text,'') THEN
      RAISE EXCEPTION 'Only reply text may be edited on a reply';
    END IF;
    IF NEW.reply_text IS DISTINCT FROM OLD.reply_text THEN
      NEW.edited_at := now();
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_observation_reply_edit ON public.kpi_observation_replies;
CREATE TRIGGER trg_guard_observation_reply_edit
  BEFORE UPDATE ON public.kpi_observation_replies
  FOR EACH ROW EXECUTE FUNCTION public.guard_observation_reply_edit();

-- 5) Guard trigger for observations: when self-edited, restrict to title/description + edited_at
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
    IF NEW.kpi_id           IS DISTINCT FROM OLD.kpi_id
       OR NEW.created_by    IS DISTINCT FROM OLD.created_by
       OR NEW.created_at    IS DISTINCT FROM OLD.created_at
       OR NEW.observer_role IS DISTINCT FROM OLD.observer_role
       OR NEW.observation_type IS DISTINCT FROM OLD.observation_type
       OR NEW.score_impact  IS DISTINCT FROM OLD.score_impact
       OR NEW.is_applied    IS DISTINCT FROM OLD.is_applied
       OR NEW.status        IS DISTINCT FROM OLD.status
       OR NEW.visibility    IS DISTINCT FROM OLD.visibility
       OR NEW.ticket_number IS DISTINCT FROM OLD.ticket_number
       OR NEW.reviewed_by   IS DISTINCT FROM OLD.reviewed_by
       OR NEW.reviewed_at   IS DISTINCT FROM OLD.reviewed_at
       OR COALESCE(NEW.evidence_urls::text,'') IS DISTINCT FROM COALESCE(OLD.evidence_urls::text,'')
       OR COALESCE(NEW.evidence_url,'')        IS DISTINCT FROM COALESCE(OLD.evidence_url,'') THEN
      -- Author is only allowed to mutate title/description after 24h would be denied by RLS anyway
      -- but they can only change text fields, not workflow fields
      RAISE EXCEPTION 'Only title/description may be edited on an observation';
    END IF;

    IF NEW.title       IS DISTINCT FROM OLD.title
       OR NEW.description IS DISTINCT FROM OLD.description THEN
      NEW.edited_at := now();
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_observation_self_edit ON public.kpi_observations;
CREATE TRIGGER trg_guard_observation_self_edit
  BEFORE UPDATE ON public.kpi_observations
  FOR EACH ROW EXECUTE FUNCTION public.guard_observation_self_edit();

-- Employment status history: append-only audit trail for the Confirmation
-- Increment Adjustment engine. Replaces sole reliance on
-- profiles.previous_employment_status (single-slot, 0% populated today).

CREATE TABLE public.employment_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  previous_status text NULL,
  new_status text NOT NULL,
  effective_date date NOT NULL,
  changed_by uuid NULL,
  changed_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL DEFAULT 'manual_edit'
    CHECK (source IN ('manual_edit','bulk_import','backfill','trigger')),
  notes text NULL
);

CREATE INDEX idx_esh_employee_effective
  ON public.employment_status_history (employee_id, effective_date DESC);

-- Idempotent backfill guard: one backfill row per (employee, new_status, date).
CREATE UNIQUE INDEX uq_esh_backfill
  ON public.employment_status_history (employee_id, new_status, effective_date)
  WHERE source = 'backfill';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.employment_status_history TO authenticated;
GRANT ALL ON public.employment_status_history TO service_role;

ALTER TABLE public.employment_status_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "esh_read_privileged"
  ON public.employment_status_history
  FOR SELECT
  TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'management'::app_role)
    OR has_role(auth.uid(), 'hr_pms'::app_role)
    OR employee_id = auth.uid()
  );

CREATE POLICY "esh_admin_write"
  ON public.employment_status_history
  FOR INSERT
  TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "esh_admin_update"
  ON public.employment_status_history
  FOR UPDATE
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "esh_admin_delete"
  ON public.employment_status_history
  FOR DELETE
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

-- BEFORE trigger: keep profiles.previous_employment_status in sync with the
-- last known prior status so the engine's fallback path always works.
CREATE OR REPLACE FUNCTION public.sync_previous_employment_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.employment_status IS DISTINCT FROM OLD.employment_status THEN
    NEW.previous_employment_status := OLD.employment_status;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_sync_prev_status ON public.profiles;
CREATE TRIGGER trg_profiles_sync_prev_status
  BEFORE UPDATE OF employment_status ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_previous_employment_status();

-- AFTER trigger: append history row on every real status change.
CREATE OR REPLACE FUNCTION public.log_employment_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.employment_status IS DISTINCT FROM OLD.employment_status THEN
    INSERT INTO public.employment_status_history
      (employee_id, previous_status, new_status, effective_date, changed_by, source)
    VALUES (
      NEW.id,
      OLD.employment_status,
      NEW.employment_status,
      COALESCE(NEW.confirmation_date, CURRENT_DATE),
      auth.uid(),
      'trigger'
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_log_status_change ON public.profiles;
CREATE TRIGGER trg_profiles_log_status_change
  AFTER UPDATE OF employment_status ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.log_employment_status_change();

-- Best-effort one-time backfill from existing snapshot columns.
INSERT INTO public.employment_status_history
  (employee_id, previous_status, new_status, effective_date, source, notes)
SELECT
  id,
  previous_employment_status,
  employment_status,
  COALESCE(confirmation_date, CURRENT_DATE),
  'backfill',
  'Seeded from profiles snapshot at migration time'
FROM public.profiles
WHERE previous_employment_status IS NOT NULL
   OR (employment_status = 'Confirmed' AND confirmation_date IS NOT NULL)
ON CONFLICT DO NOTHING;
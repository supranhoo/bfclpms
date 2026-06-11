
-- 1. Enum additions (must be in their own statement / committed before use)
ALTER TYPE public.safety_incident_status ADD VALUE IF NOT EXISTS 'management_review' AFTER 'reported';
ALTER TYPE public.safety_incident_status ADD VALUE IF NOT EXISTS 'safety_head_review' AFTER 'corrective_action';

-- 2. New ownership columns
ALTER TABLE public.safety_incidents
  ADD COLUMN IF NOT EXISTS safety_head_id uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS verifier_id    uuid REFERENCES public.profiles(id);

CREATE INDEX IF NOT EXISTS idx_safety_incidents_safety_head_id ON public.safety_incidents(safety_head_id);
CREATE INDEX IF NOT EXISTS idx_safety_incidents_verifier_id    ON public.safety_incidents(verifier_id);

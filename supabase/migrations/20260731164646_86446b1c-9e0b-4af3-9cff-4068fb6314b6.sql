-- ADR-221 — Annual Review eligibility exemption approval

CREATE TABLE public.annual_review_eligibility_exemption_policy (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_key text NOT NULL UNIQUE,
  label text NOT NULL,
  is_exemptable boolean NOT NULL DEFAULT false,
  requires_reason boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.annual_review_eligibility_exemption_policy TO authenticated;
GRANT ALL ON public.annual_review_eligibility_exemption_policy TO service_role;
ALTER TABLE public.annual_review_eligibility_exemption_policy ENABLE ROW LEVEL SECURITY;

CREATE POLICY "elig_policy_read" ON public.annual_review_eligibility_exemption_policy
FOR SELECT TO authenticated USING (true);

CREATE POLICY "elig_policy_admin_write" ON public.annual_review_eligibility_exemption_policy
FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'hr_pms'))
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'hr_pms'));

GRANT INSERT, UPDATE, DELETE ON public.annual_review_eligibility_exemption_policy TO authenticated;

CREATE TABLE public.annual_review_eligibility_exemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id uuid NOT NULL REFERENCES public.annual_review_instances(id) ON DELETE CASCADE,
  cycle_id uuid,
  employee_id uuid,
  criterion_id text NOT NULL,
  criterion_name text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  reason text,
  requested_by uuid,
  requested_at timestamptz NOT NULL DEFAULT now(),
  decided_by uuid,
  decided_at timestamptz,
  decision_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ar_elig_exemption_status_chk CHECK (status IN ('pending','approved','rejected')),
  CONSTRAINT ar_elig_exemption_unique UNIQUE (instance_id, criterion_id)
);

CREATE INDEX idx_ar_elig_exemptions_cycle ON public.annual_review_eligibility_exemptions(cycle_id);
CREATE INDEX idx_ar_elig_exemptions_instance ON public.annual_review_eligibility_exemptions(instance_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.annual_review_eligibility_exemptions TO authenticated;
GRANT ALL ON public.annual_review_eligibility_exemptions TO service_role;
ALTER TABLE public.annual_review_eligibility_exemptions ENABLE ROW LEVEL SECURITY;

-- Normalise a question name the same way the client does.
CREATE OR REPLACE FUNCTION public.ar_normalise_question(_name text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT btrim(regexp_replace(lower(coalesce(_name, '')), '\s+', ' ', 'g'))
$$;

-- Policy lookup: exemptable only when a master row matches the question name.
CREATE OR REPLACE FUNCTION public.ar_eligibility_is_exemptable(_criterion_name text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(
    (SELECT bool_and(p.is_exemptable)
       FROM public.annual_review_eligibility_exemption_policy p
      WHERE public.ar_normalise_question(_criterion_name) LIKE '%' || p.question_key || '%'),
    false)
$$;

CREATE OR REPLACE FUNCTION public.ar_can_approve_eligibility_exemption(_user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(_user, 'admin')
      OR public.has_role(_user, 'hr_pms')
      OR public.has_role(_user, 'management')
$$;

CREATE OR REPLACE FUNCTION public.ar_elig_exemption_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status IN ('pending','approved')
     AND NOT public.ar_eligibility_is_exemptable(NEW.criterion_name) THEN
    RAISE EXCEPTION 'Criterion "%" is not exemptable under the eligibility exemption policy', NEW.criterion_name;
  END IF;

  IF NEW.status IN ('approved','rejected') THEN
    IF NEW.decided_by IS NOT NULL AND NEW.decided_by = NEW.requested_by
       AND NOT public.has_role(NEW.decided_by, 'admin') THEN
      RAISE EXCEPTION 'Self-approval of an eligibility exemption is not allowed';
    END IF;
    IF NEW.decided_at IS NULL THEN NEW.decided_at := now(); END IF;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_ar_exemption_guard
BEFORE INSERT OR UPDATE ON public.annual_review_eligibility_exemptions
FOR EACH ROW EXECUTE FUNCTION public.ar_elig_exemption_guard();

CREATE POLICY "ar_elig_exemption_read" ON public.annual_review_eligibility_exemptions
FOR SELECT TO authenticated
USING (
  public.ar_can_approve_eligibility_exemption(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.annual_review_instances i
     WHERE i.id = annual_review_eligibility_exemptions.instance_id
       AND public.can_access_annual_review_instance_for_assistance(i.id)
  )
);

CREATE POLICY "ar_elig_exemption_insert" ON public.annual_review_eligibility_exemptions
FOR INSERT TO authenticated
WITH CHECK (
  requested_by = auth.uid()
  AND (
    public.ar_can_approve_eligibility_exemption(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.annual_review_instances i
       WHERE i.id = instance_id
         AND public.can_access_annual_review_instance_for_assistance(i.id)
    )
  )
);

CREATE POLICY "ar_elig_exemption_decide" ON public.annual_review_eligibility_exemptions
FOR UPDATE TO authenticated
USING (public.ar_can_approve_eligibility_exemption(auth.uid()))
WITH CHECK (public.ar_can_approve_eligibility_exemption(auth.uid()));

CREATE POLICY "ar_elig_exemption_delete" ON public.annual_review_eligibility_exemptions
FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin'));
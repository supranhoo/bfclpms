ALTER TABLE public.annual_review_eligibility_exemption_policy
  ADD COLUMN IF NOT EXISTS is_protected boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS updated_by uuid;

UPDATE public.annual_review_eligibility_exemption_policy
   SET is_protected = true
 WHERE question_key IN ('disciplinary','month completion','months of service','tenure');

UPDATE public.annual_review_eligibility_exemption_policy SET sort_order = 10 WHERE question_key = 'absent';
UPDATE public.annual_review_eligibility_exemption_policy SET sort_order = 20 WHERE question_key = 'lwp';
UPDATE public.annual_review_eligibility_exemption_policy SET sort_order = 30 WHERE question_key = 'leave without pay';

CREATE TABLE IF NOT EXISTS public.annual_review_eligibility_policy_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id uuid,
  question_key text,
  action text NOT NULL,
  before_state jsonb,
  after_state jsonb,
  changed_by uuid,
  changed_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ar_elig_policy_audit_action_chk CHECK (action IN ('insert','update','delete'))
);

CREATE INDEX IF NOT EXISTS idx_ar_elig_policy_audit_changed_at
  ON public.annual_review_eligibility_policy_audit(changed_at DESC);

GRANT SELECT ON public.annual_review_eligibility_policy_audit TO authenticated;
GRANT ALL ON public.annual_review_eligibility_policy_audit TO service_role;
ALTER TABLE public.annual_review_eligibility_policy_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ar_elig_policy_audit_read" ON public.annual_review_eligibility_policy_audit
FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'hr_pms')
  OR public.has_role(auth.uid(), 'management')
);

CREATE OR REPLACE FUNCTION public.ar_elig_policy_audit_tg()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    INSERT INTO public.annual_review_eligibility_policy_audit
      (rule_id, question_key, action, before_state, after_state, changed_by)
    VALUES (OLD.id, OLD.question_key, 'delete', to_jsonb(OLD), NULL, auth.uid());
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    NEW.updated_at := now();
    IF to_jsonb(NEW) - 'updated_at' IS DISTINCT FROM to_jsonb(OLD) - 'updated_at' THEN
      INSERT INTO public.annual_review_eligibility_policy_audit
        (rule_id, question_key, action, before_state, after_state, changed_by)
      VALUES (NEW.id, NEW.question_key, 'update', to_jsonb(OLD), to_jsonb(NEW), auth.uid());
    END IF;
    RETURN NEW;
  END IF;

  INSERT INTO public.annual_review_eligibility_policy_audit
    (rule_id, question_key, action, before_state, after_state, changed_by)
  VALUES (NEW.id, NEW.question_key, 'insert', NULL, to_jsonb(NEW), auth.uid());
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ar_elig_policy_audit ON public.annual_review_eligibility_exemption_policy;
CREATE TRIGGER trg_ar_elig_policy_audit
AFTER INSERT OR DELETE ON public.annual_review_eligibility_exemption_policy
FOR EACH ROW EXECUTE FUNCTION public.ar_elig_policy_audit_tg();

DROP TRIGGER IF EXISTS trg_ar_elig_policy_audit_upd ON public.annual_review_eligibility_exemption_policy;
CREATE TRIGGER trg_ar_elig_policy_audit_upd
BEFORE UPDATE ON public.annual_review_eligibility_exemption_policy
FOR EACH ROW EXECUTE FUNCTION public.ar_elig_policy_audit_tg();
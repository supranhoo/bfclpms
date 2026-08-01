
-- ADR-224: configurable exemption penalty rule
ALTER TABLE public.annual_review_bell_curve_config
  ADD COLUMN IF NOT EXISTS exempted_penalty_mode text NOT NULL DEFAULT 'top_tiers_excluded',
  ADD COLUMN IF NOT EXISTS exempted_step_down_slabs integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS exempted_penalty_scope text NOT NULL DEFAULT 'all_slabs',
  ADD COLUMN IF NOT EXISTS exempted_penalty_top_slabs integer NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS exempted_penalty_floor_percent numeric NOT NULL DEFAULT 0;

ALTER TABLE public.annual_review_bell_curve_config
  DROP CONSTRAINT IF EXISTS ar_bcc_penalty_mode_check;
ALTER TABLE public.annual_review_bell_curve_config
  ADD CONSTRAINT ar_bcc_penalty_mode_check
  CHECK (exempted_penalty_mode IN ('none','top_tiers_excluded','step_down'));

ALTER TABLE public.annual_review_bell_curve_config
  DROP CONSTRAINT IF EXISTS ar_bcc_penalty_scope_check;
ALTER TABLE public.annual_review_bell_curve_config
  ADD CONSTRAINT ar_bcc_penalty_scope_check
  CHECK (exempted_penalty_scope IN ('all_slabs','top_slabs_only'));

-- ADR-224: bulk run header
CREATE TABLE IF NOT EXISTS public.annual_review_bulk_exemption_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id uuid NOT NULL,
  criterion_key text NOT NULL,
  criterion_label text,
  operator text NOT NULL DEFAULT 'lte',
  threshold text,
  only_sole_failure boolean NOT NULL DEFAULT true,
  reason text NOT NULL,
  matched_count integer NOT NULL DEFAULT 0,
  applied_count integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'applied',
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  performed_by uuid,
  revoked_by uuid,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.annual_review_bulk_exemption_runs TO authenticated;
GRANT ALL ON public.annual_review_bulk_exemption_runs TO service_role;
ALTER TABLE public.annual_review_bulk_exemption_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ar_bulk_exemption_runs_read ON public.annual_review_bulk_exemption_runs;
CREATE POLICY ar_bulk_exemption_runs_read
  ON public.annual_review_bulk_exemption_runs FOR SELECT TO authenticated
  USING (public.ar_can_approve_eligibility_exemption(auth.uid()));

CREATE INDEX IF NOT EXISTS idx_ar_bulk_exemption_runs_cycle
  ON public.annual_review_bulk_exemption_runs (cycle_id, created_at DESC);

-- ADR-224: provenance + frozen penalty impact on exemption rows
ALTER TABLE public.annual_review_eligibility_exemptions
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS bulk_run_id uuid REFERENCES public.annual_review_bulk_exemption_runs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS penalty_applied boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS penalty_from_percent numeric,
  ADD COLUMN IF NOT EXISTS penalty_to_percent numeric,
  ADD COLUMN IF NOT EXISTS penalty_note text;

ALTER TABLE public.annual_review_eligibility_exemptions
  DROP CONSTRAINT IF EXISTS ar_elig_exemptions_source_check;
ALTER TABLE public.annual_review_eligibility_exemptions
  ADD CONSTRAINT ar_elig_exemptions_source_check
  CHECK (source IN ('manual','bulk'));

CREATE INDEX IF NOT EXISTS idx_ar_elig_exemptions_bulk_run
  ON public.annual_review_eligibility_exemptions (bulk_run_id);

-- ADR-224: server-side operator evaluation (mirrors lib/annualReview/eligibility.ts)
CREATE OR REPLACE FUNCTION public.ar_eligibility_evaluate(
  _operator text, _type text, _actual jsonb, _expected jsonb
) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE
SET search_path TO 'public'
AS $$
DECLARE a numeric; e numeric; sa text; se text;
BEGIN
  IF _actual IS NULL OR jsonb_typeof(_actual) = 'null' THEN RETURN false; END IF;
  IF _type = 'number' THEN
    BEGIN
      a := (CASE WHEN jsonb_typeof(_actual) = 'string' THEN (_actual #>> '{}') ELSE _actual::text END)::numeric;
      e := (CASE WHEN jsonb_typeof(_expected) = 'string' THEN (_expected #>> '{}') ELSE _expected::text END)::numeric;
    EXCEPTION WHEN others THEN RETURN false; END;
    RETURN CASE _operator
      WHEN 'gt' THEN a > e WHEN 'gte' THEN a >= e
      WHEN 'lt' THEN a < e WHEN 'lte' THEN a <= e
      WHEN 'equals' THEN a = e WHEN 'not_equals' THEN a <> e
      ELSE false END;
  END IF;
  sa := lower(coalesce(_actual #>> '{}', ''));
  se := lower(coalesce(_expected #>> '{}', ''));
  IF _type = 'boolean' THEN
    sa := CASE WHEN sa IN ('true','1') THEN 'true' ELSE 'false' END;
    se := CASE WHEN se IN ('true','1') THEN 'true' ELSE 'false' END;
  END IF;
  RETURN CASE _operator
    WHEN 'equals' THEN sa = se WHEN 'not_equals' THEN sa <> se
    ELSE false END;
END;
$$;

-- ADR-224: bulk exemption engine
CREATE OR REPLACE FUNCTION public.bulk_exempt_eligibility_criterion(
  p_cycle_id uuid,
  p_criterion_id text,
  p_operator text,
  p_threshold text,
  p_only_sole_failure boolean DEFAULT true,
  p_reason text DEFAULT NULL,
  p_dry_run boolean DEFAULT false
) RETURNS TABLE (
  instance_id uuid, employee_id uuid, criterion_name text,
  actual text, action text, message text
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_run_id uuid;
  v_matched integer := 0;
  v_applied integer := 0;
  r record;
  c jsonb;
  v_actual jsonb;
  v_fail_total integer;
  v_target_fail boolean;
  v_target_name text;
  v_target_actual text;
  v_within boolean;
BEGIN
  IF v_uid IS NULL OR NOT public.ar_can_approve_eligibility_exemption(v_uid) THEN
    RAISE EXCEPTION 'Not authorised to run bulk eligibility exemptions';
  END IF;
  IF coalesce(trim(p_reason), '') = '' AND NOT p_dry_run THEN
    RAISE EXCEPTION 'A reason is required for a bulk exemption';
  END IF;

  IF NOT p_dry_run THEN
    INSERT INTO public.annual_review_bulk_exemption_runs
      (cycle_id, criterion_key, operator, threshold, only_sole_failure, reason, performed_by)
    VALUES (p_cycle_id, p_criterion_id, coalesce(p_operator,'lte'), p_threshold,
            coalesce(p_only_sole_failure,true), p_reason, v_uid)
    RETURNING id INTO v_run_id;
  END IF;

  FOR r IN
    SELECT i.id, i.employee_id, i.eligibility_inputs,
           coalesce(t.sections->'eligibility_criteria','[]'::jsonb) AS criteria
      FROM public.annual_review_instances i
      JOIN public.annual_review_templates t
        ON t.id = coalesce(i.template_override_id, i.template_id)
     WHERE i.cycle_id = p_cycle_id
  LOOP
    v_fail_total := 0; v_target_fail := false;
    v_target_name := NULL; v_target_actual := NULL; v_within := false;

    FOR c IN SELECT * FROM jsonb_array_elements(r.criteria)
    LOOP
      v_actual := coalesce(
        r.eligibility_inputs -> (c->>'id'),
        r.eligibility_inputs -> (c->>'name')
      );
      IF public.ar_eligibility_evaluate(c->>'operator', c->>'type', v_actual, c->'expected_value') THEN
        CONTINUE;
      END IF;
      v_fail_total := v_fail_total + 1;
      IF (c->>'id') = p_criterion_id THEN
        v_target_fail := true;
        v_target_name := c->>'name';
        v_target_actual := v_actual #>> '{}';
        v_within := public.ar_eligibility_evaluate(
          coalesce(p_operator,'lte'), c->>'type', v_actual, to_jsonb(p_threshold));
      END IF;
    END LOOP;

    CONTINUE WHEN NOT v_target_fail;
    IF NOT v_within THEN CONTINUE; END IF;
    IF coalesce(p_only_sole_failure,true) AND v_fail_total > 1 THEN CONTINUE; END IF;

    IF NOT public.ar_eligibility_is_exemptable(v_target_name) THEN
      RAISE EXCEPTION 'Criterion "%" is not exemptable under the eligibility exemption policy', v_target_name;
    END IF;

    v_matched := v_matched + 1;
    instance_id := r.id; employee_id := r.employee_id;
    criterion_name := v_target_name; actual := v_target_actual;

    IF p_dry_run THEN
      action := 'match'; message := NULL;
    ELSE
      INSERT INTO public.annual_review_eligibility_exemptions
        (instance_id, cycle_id, employee_id, criterion_id, criterion_name, reason,
         requested_by, status, decided_by, decided_at, source, bulk_run_id)
      VALUES (r.id, p_cycle_id, r.employee_id, p_criterion_id, v_target_name, p_reason,
              NULL, 'approved', v_uid, now(), 'bulk', v_run_id)
      ON CONFLICT (instance_id, criterion_id) DO UPDATE
        SET status = 'approved', reason = EXCLUDED.reason,
            decided_by = EXCLUDED.decided_by, decided_at = now(),
            source = 'bulk', bulk_run_id = EXCLUDED.bulk_run_id, updated_at = now();
      v_applied := v_applied + 1;
      action := 'exempted'; message := NULL;
    END IF;
    RETURN NEXT;
  END LOOP;

  IF NOT p_dry_run THEN
    UPDATE public.annual_review_bulk_exemption_runs
       SET matched_count = v_matched, applied_count = v_applied, updated_at = now()
     WHERE id = v_run_id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.bulk_exempt_eligibility_criterion(uuid,text,text,text,boolean,text,boolean) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.bulk_exempt_eligibility_criterion(uuid,text,text,text,boolean,text,boolean) TO authenticated, service_role;

-- ADR-224: undo an entire bulk run
CREATE OR REPLACE FUNCTION public.revoke_bulk_exemption_run(p_run_id uuid)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_uid uuid := auth.uid(); v_deleted integer := 0;
BEGIN
  IF v_uid IS NULL OR NOT public.ar_can_approve_eligibility_exemption(v_uid) THEN
    RAISE EXCEPTION 'Not authorised to revoke a bulk exemption run';
  END IF;
  DELETE FROM public.annual_review_eligibility_exemptions WHERE bulk_run_id = p_run_id;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  UPDATE public.annual_review_bulk_exemption_runs
     SET status = 'revoked', revoked_by = v_uid, revoked_at = now(), updated_at = now()
   WHERE id = p_run_id;
  RETURN v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.revoke_bulk_exemption_run(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.revoke_bulk_exemption_run(uuid) TO authenticated, service_role;

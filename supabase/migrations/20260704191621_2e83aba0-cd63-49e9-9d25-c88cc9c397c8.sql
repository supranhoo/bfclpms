
-- 1) Effective-template helper (discoverable SSOT for future SQL)
CREATE OR REPLACE FUNCTION public.annual_review_effective_template_id(p_instance_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(template_override_id, template_id)
    FROM public.annual_review_instances
   WHERE id = p_instance_id
$$;

COMMENT ON FUNCTION public.annual_review_effective_template_id(uuid) IS
'SSOT: effective annual-review template for an instance = COALESCE(template_override_id, template_id). Any SQL that maps responses to criteria/weights MUST use this or the same COALESCE inline. See POLICY §AR-EFFECTIVE-TEMPLATE-SSOT.';

-- 2) Patch the scoring SSOT to honor the override
CREATE OR REPLACE FUNCTION public.compute_annual_review_weighted_score(
  p_instance_id uuid,
  p_reviewer_role annual_reviewer_role
)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SET search_path = 'public'
AS $function$
DECLARE
  v_scores    jsonb;
  v_criteria  jsonb;
  v_crit      jsonb;
  v_id        text;
  v_weight    numeric;
  v_score     numeric;
  v_stages    jsonb;
  v_total     numeric := 0;
  v_has_stage boolean;
BEGIN
  -- Resolve criteria against the EFFECTIVE template (override wins).
  -- Any change here must be mirrored in TS scoring readers.
  SELECT r.criteria_scores, t.sections->'criteria'
    INTO v_scores, v_criteria
    FROM public.annual_review_responses r
    JOIN public.annual_review_instances i ON i.id = r.instance_id
    JOIN public.annual_review_templates  t
      ON t.id = COALESCE(i.template_override_id, i.template_id)
   WHERE r.instance_id = p_instance_id
     AND r.reviewer_role = p_reviewer_role;

  IF v_scores IS NULL OR v_criteria IS NULL OR jsonb_typeof(v_criteria) <> 'array' THEN
    RETURN NULL;
  END IF;

  FOR v_crit IN SELECT * FROM jsonb_array_elements(v_criteria) LOOP
    v_id     := v_crit->>'id';
    v_weight := COALESCE((v_crit->>'weight')::numeric, 0);
    v_stages := v_crit->'reviewer_stages';

    IF v_stages IS NOT NULL AND jsonb_typeof(v_stages) = 'array' THEN
      SELECT EXISTS (
        SELECT 1 FROM jsonb_array_elements_text(v_stages) s
         WHERE s = p_reviewer_role::text
      ) INTO v_has_stage;
      IF NOT v_has_stage THEN CONTINUE; END IF;
    END IF;

    IF v_id IS NULL OR NOT (v_scores ? v_id) THEN CONTINUE; END IF;
    BEGIN
      v_score := (v_scores->>v_id)::numeric;
    EXCEPTION WHEN others THEN
      CONTINUE;
    END;
    IF v_score IS NULL THEN CONTINUE; END IF;

    v_total := v_total + (v_weight * v_score);
  END LOOP;

  RETURN v_total;
END $function$;

COMMENT ON FUNCTION public.compute_annual_review_weighted_score(uuid, annual_reviewer_role) IS
'SSOT for annual-review per-stage weighted_score. Resolves criteria against COALESCE(template_override_id, template_id). Do NOT re-introduce a bare i.template_id join here.';

-- 3) One-shot audit snapshot for reversibility
CREATE TABLE IF NOT EXISTS public.annual_review_rescore_audit_2026_07 (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  response_id              uuid NOT NULL,
  instance_id              uuid NOT NULL,
  reviewer_role            annual_reviewer_role NOT NULL,
  previous_weighted_score  numeric,
  new_weighted_score       numeric,
  template_override_id     uuid,
  template_id              uuid,
  created_at               timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.annual_review_rescore_audit_2026_07 TO authenticated;
GRANT ALL    ON public.annual_review_rescore_audit_2026_07 TO service_role;

ALTER TABLE public.annual_review_rescore_audit_2026_07 ENABLE ROW LEVEL SECURITY;

CREATE POLICY "arra_2026_07_admin_hrpms_read"
  ON public.annual_review_rescore_audit_2026_07
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'hr_pms'));

-- 4) Snapshot BEFORE rewriting scores (only rows we are about to change)
INSERT INTO public.annual_review_rescore_audit_2026_07
  (response_id, instance_id, reviewer_role, previous_weighted_score, new_weighted_score, template_override_id, template_id)
SELECT r.id,
       r.instance_id,
       r.reviewer_role,
       r.weighted_score AS previous_weighted_score,
       public.compute_annual_review_weighted_score(r.instance_id, r.reviewer_role) AS new_weighted_score,
       i.template_override_id,
       i.template_id
  FROM public.annual_review_responses r
  JOIN public.annual_review_instances i ON i.id = r.instance_id
 WHERE i.template_override_id IS NOT NULL
   AND i.template_override_id <> i.template_id;

-- 5) Apply the corrected scores in-place
UPDATE public.annual_review_responses r
   SET weighted_score = a.new_weighted_score
  FROM public.annual_review_rescore_audit_2026_07 a
 WHERE a.response_id = r.id
   AND a.new_weighted_score IS DISTINCT FROM r.weighted_score;

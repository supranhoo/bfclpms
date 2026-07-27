-- ============================================================
-- ADR-172 — POLICY §AR-STAGE-SCORE-REQUIRED
-- A review stage may not be locked/submitted with zero scored criteria
-- when the resolved template exposes scoreable criteria for that stage.
--
-- RCA: `advance_annual_review_status` computed `v_stage_scores` but never
-- used it, and the client guard in TeamReviewDetailContent was gated on
-- `role === 'self'`. Reviewer stages could therefore lock an empty
-- response with weighted_score = 0.00, which admin grids rendered as a
-- legitimate `0.0` rating.
--
-- Enforcement is placed on annual_review_responses (not inside a single
-- RPC) so every writer — advance RPC, proxy RPC, transfer/repair paths —
-- is covered by one invariant.
-- Rollback: DROP TRIGGER trg_ar_stage_score_required ON public.annual_review_responses;
-- ============================================================

-- Count criteria the given stage is expected to score, for the template
-- effectively resolved for the instance. Mirrors the TS SSOT in
-- src/lib/annualReview/templateVisibility.ts (criteriaForStage +
-- systemScoresFullyAllocated).
CREATE OR REPLACE FUNCTION public.annual_review_stage_scoreable_criteria_count(
  p_instance_id uuid,
  p_reviewer_role annual_reviewer_role
)
RETURNS integer
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $function$
DECLARE
  v_tpl_id uuid;
  v_sections jsonb;
  v_sys_weight numeric := 0;
  v_count integer := 0;
BEGIN
  v_tpl_id := public.annual_review_effective_template_id(p_instance_id);
  IF v_tpl_id IS NULL THEN RETURN 0; END IF;

  SELECT t.sections INTO v_sections
    FROM public.annual_review_templates t WHERE t.id = v_tpl_id;
  IF v_sections IS NULL THEN RETURN 0; END IF;

  -- System scores fully allocated (>= 100) => criteria contribute nothing,
  -- the criteria card is hidden client-side. Treat as narrative-only.
  IF jsonb_typeof(v_sections->'system_scores') = 'array' THEN
    SELECT COALESCE(SUM(COALESCE((s->>'weight')::numeric, 0)), 0)
      INTO v_sys_weight
      FROM jsonb_array_elements(v_sections->'system_scores') s;
    IF v_sys_weight >= 100 THEN RETURN 0; END IF;
  END IF;

  IF jsonb_typeof(v_sections->'criteria') <> 'array' THEN RETURN 0; END IF;

  SELECT count(*) INTO v_count
    FROM jsonb_array_elements(v_sections->'criteria') c
   WHERE COALESCE(jsonb_array_length(
           CASE WHEN jsonb_typeof(c->'reviewer_stages') = 'array'
                THEN c->'reviewer_stages' ELSE '[]'::jsonb END), 0) = 0
      OR (c->'reviewer_stages') ? p_reviewer_role::text;

  RETURN COALESCE(v_count, 0);
END $function$;

GRANT EXECUTE ON FUNCTION public.annual_review_stage_scoreable_criteria_count(uuid, annual_reviewer_role) TO authenticated, service_role;

-- Guard trigger --------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_ar_stage_score_required()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_scored integer;
  v_expected integer;
BEGIN
  -- Only evaluate on the lock transition (submission).
  IF NOT NEW.is_locked THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.is_locked THEN RETURN NEW; END IF;

  -- Explicit repair bypass for admin tooling.
  IF COALESCE(current_setting('annual_review.bypass_stage_score_guard', true), 'off') = 'on' THEN
    RETURN NEW;
  END IF;

  v_scored := (
    SELECT count(*) FROM jsonb_object_keys(
      CASE WHEN jsonb_typeof(NEW.criteria_scores) = 'object'
           THEN NEW.criteria_scores ELSE '{}'::jsonb END)
  );
  IF v_scored > 0 THEN RETURN NEW; END IF;

  v_expected := public.annual_review_stage_scoreable_criteria_count(
    NEW.instance_id, NEW.reviewer_role);

  IF v_expected > 0 THEN
    RAISE EXCEPTION
      'ADR-172: cannot submit stage % with no criteria scored — this template requires % criterion score(s). Score every criterion before submitting (instance %).',
      NEW.reviewer_role, v_expected, NEW.instance_id
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS trg_ar_stage_score_required ON public.annual_review_responses;
CREATE TRIGGER trg_ar_stage_score_required
  BEFORE INSERT OR UPDATE ON public.annual_review_responses
  FOR EACH ROW EXECUTE FUNCTION public.tg_ar_stage_score_required();

-- Repair audit ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.annual_review_empty_stage_repair_2026_07 (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id uuid NOT NULL,
  response_id uuid NOT NULL,
  employee_code text,
  reviewer_role annual_reviewer_role NOT NULL,
  reviewer_id uuid,
  prev_overall_status annual_review_status,
  new_overall_status annual_review_status,
  prev_total_score numeric,
  prev_final_rating text,
  prev_criteria_weighted_score numeric,
  prev_submitted_at timestamptz,
  preserved_qualitative jsonb NOT NULL DEFAULT '{}'::jsonb,
  repaired_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.annual_review_empty_stage_repair_2026_07 TO authenticated;
GRANT ALL ON public.annual_review_empty_stage_repair_2026_07 TO service_role;

ALTER TABLE public.annual_review_empty_stage_repair_2026_07 ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ar_empty_stage_repair_read_admin_hr"
  ON public.annual_review_empty_stage_repair_2026_07 FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'hr_pms'));
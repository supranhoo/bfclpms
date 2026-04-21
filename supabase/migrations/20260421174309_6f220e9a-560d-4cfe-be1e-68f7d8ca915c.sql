-- Phase B1: Org KPI Revision Flow

-- Add revision tracking columns
ALTER TABLE public.org_kpi_values
  ADD COLUMN IF NOT EXISTS last_revision_reason text,
  ADD COLUMN IF NOT EXISTS last_revision_requested_by uuid,
  ADD COLUMN IF NOT EXISTS last_revision_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS revision_count integer NOT NULL DEFAULT 0;

-- RPC: request_org_kpi_revision
-- Called by reviewers when the source org KPI value itself is wrong.
-- Reverts the OKV to draft and cascades a rollback to employees still in early stages.
CREATE OR REPLACE FUNCTION public.request_org_kpi_revision(
  p_kpi_id uuid,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_kpi RECORD;
  v_okv RECORD;
  v_cascade_rolled_back integer := 0;
  v_cascade_flagged integer := 0;
  v_child_kpi RECORD;
  v_old_status text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_reason IS NULL OR length(trim(p_reason)) < 5 THEN
    RAISE EXCEPTION 'Revision reason is required (minimum 5 characters)';
  END IF;

  -- Load the source KPI (must be org-level)
  SELECT id, category_id, kra_name, kpi_name, review_period, review_year,
         is_org_level, status, employee_id
  INTO v_kpi
  FROM public.kpis
  WHERE id = p_kpi_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'KPI not found';
  END IF;

  IF NOT v_kpi.is_org_level THEN
    RAISE EXCEPTION 'Revision can only be requested for org-level KPIs';
  END IF;

  -- Find the matching OKV using the natural key (case/space-insensitive on kra/kpi names)
  SELECT *
  INTO v_okv
  FROM public.org_kpi_values
  WHERE category_id = v_kpi.category_id
    AND lower(trim(kra_name)) = lower(trim(v_kpi.kra_name))
    AND lower(trim(kpi_name)) = lower(trim(v_kpi.kpi_name))
    AND review_period = v_kpi.review_period
    AND review_year = v_kpi.review_year
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No matching org KPI value found for this definition';
  END IF;

  -- 1. Revert OKV to draft + record revision metadata
  UPDATE public.org_kpi_values
  SET status = 'draft',
      last_revision_reason = p_reason,
      last_revision_requested_by = v_user_id,
      last_revision_requested_at = now(),
      revision_count = COALESCE(revision_count, 0) + 1,
      updated_at = now()
  WHERE id = v_okv.id;

  -- 2. Cascade across all sibling employee KPIs sharing the same natural key
  FOR v_child_kpi IN
    SELECT id, employee_id, status
    FROM public.kpis
    WHERE category_id = v_kpi.category_id
      AND lower(trim(kra_name)) = lower(trim(v_kpi.kra_name))
      AND lower(trim(kpi_name)) = lower(trim(v_kpi.kpi_name))
      AND review_period = v_kpi.review_period
      AND review_year = v_kpi.review_year
      AND is_org_level = true
  LOOP
    v_old_status := v_child_kpi.status;

    -- Early stages (≤ self_review): roll back to kra_set + clear submission scores
    IF v_child_kpi.status IN ('self_review', 'manager_review') THEN
      -- Clear self-review scores (preserve evidence per send-back governance)
      UPDATE public.review_submissions
      SET self_score = NULL,
          self_rating = NULL,
          self_remarks = NULL,
          self_submitted_at = NULL,
          updated_at = now()
      WHERE kpi_id = v_child_kpi.id;

      -- Roll status back
      UPDATE public.kpis
      SET status = 'kra_set',
          updated_at = now()
      WHERE id = v_child_kpi.id;

      INSERT INTO public.kpi_audit_logs (
        kpi_id, action, performed_by, old_value, new_value, metadata
      ) VALUES (
        v_child_kpi.id,
        'STATUS_REVISION_CASCADE',
        v_user_id,
        jsonb_build_object('status', v_old_status),
        jsonb_build_object('status', 'kra_set'),
        jsonb_build_object(
          'source_okv_id', v_okv.id,
          'reason', p_reason,
          'cascade_type', 'rolled_back'
        )
      );

      v_cascade_rolled_back := v_cascade_rolled_back + 1;
    ELSE
      -- Past manager_check: leave in place but flag in audit log
      INSERT INTO public.kpi_audit_logs (
        kpi_id, action, performed_by, metadata
      ) VALUES (
        v_child_kpi.id,
        'ORG_KPI_REVISION_FLAGGED',
        v_user_id,
        jsonb_build_object(
          'source_okv_id', v_okv.id,
          'reason', p_reason,
          'current_status', v_old_status,
          'note', 'Score retained against pre-revision value'
        )
      );

      v_cascade_flagged := v_cascade_flagged + 1;
    END IF;
  END LOOP;

  -- 3. Parent audit log on the triggering KPI
  INSERT INTO public.kpi_audit_logs (
    kpi_id, action, performed_by, metadata
  ) VALUES (
    p_kpi_id,
    'ORG_KPI_REVISION_REQUESTED',
    v_user_id,
    jsonb_build_object(
      'okv_id', v_okv.id,
      'reason', p_reason,
      'cascade_rolled_back', v_cascade_rolled_back,
      'cascade_flagged', v_cascade_flagged,
      'previous_okv_status', v_okv.status
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'okv_id', v_okv.id,
    'previous_okv_status', v_okv.status,
    'cascade_rolled_back', v_cascade_rolled_back,
    'cascade_flagged', v_cascade_flagged,
    'revision_count', COALESCE(v_okv.revision_count, 0) + 1
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.request_org_kpi_revision(uuid, text) TO authenticated;
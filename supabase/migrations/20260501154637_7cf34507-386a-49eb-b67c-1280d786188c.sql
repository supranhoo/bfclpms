
-- Action history table for KPI Standardization undo support
CREATE TABLE public.kpi_standardization_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action_type text NOT NULL CHECK (action_type IN (
    'create_definition','link_alias','rename_kpis',
    'delete_definition','edit_definition','unlink_alias'
  )),
  definition_id uuid NULL,
  category_id uuid NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  affected_row_count integer NOT NULL DEFAULT 0,
  performed_by uuid NULL,
  performed_at timestamptz NOT NULL DEFAULT now(),
  reversed_at timestamptz NULL,
  reversed_by uuid NULL,
  reverse_notes text NULL
);

CREATE INDEX idx_kpi_std_actions_performed_at ON public.kpi_standardization_actions (performed_at DESC);
CREATE INDEX idx_kpi_std_actions_definition_id ON public.kpi_standardization_actions (definition_id);
CREATE INDEX idx_kpi_std_actions_type ON public.kpi_standardization_actions (action_type);

ALTER TABLE public.kpi_standardization_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read standardization actions"
  ON public.kpi_standardization_actions FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(),'admin'));

CREATE POLICY "Admins can insert standardization actions"
  ON public.kpi_standardization_actions FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin'));

-- No UPDATE/DELETE policies — rows are append-only.
-- The reverse function is SECURITY DEFINER and bypasses RLS for the flip.

-- ----- Helper: log a standardization action -----
CREATE OR REPLACE FUNCTION public.log_standardization_action(
  p_action_type text,
  p_definition_id uuid,
  p_category_id uuid,
  p_payload jsonb,
  p_affected_row_count integer
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_id uuid;
BEGIN
  INSERT INTO public.kpi_standardization_actions
    (action_type, definition_id, category_id, payload, affected_row_count, performed_by)
  VALUES
    (p_action_type, p_definition_id, p_category_id, COALESCE(p_payload,'{}'::jsonb), COALESCE(p_affected_row_count,0), auth.uid())
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- ----- Replace correct_may_kpis to capture before-image into action log -----
CREATE OR REPLACE FUNCTION public.correct_may_kpis(
  p_category_id uuid,
  p_old_kra text,
  p_old_kpi text,
  p_new_kra text,
  p_new_kpi text,
  p_definition_id uuid,
  p_review_period text,
  p_review_year integer
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
  v_org_count INTEGER;
  v_month_num INTEGER;
  v_kpi_before jsonb;
  v_org_before jsonb;
BEGIN
  v_month_num := CASE p_review_period
    WHEN 'January' THEN 1 WHEN 'February' THEN 2 WHEN 'March' THEN 3
    WHEN 'April' THEN 4 WHEN 'May' THEN 5 WHEN 'June' THEN 6
    WHEN 'July' THEN 7 WHEN 'August' THEN 8 WHEN 'September' THEN 9
    WHEN 'October' THEN 10 WHEN 'November' THEN 11 WHEN 'December' THEN 12
    ELSE 0
  END;

  IF p_review_year < 2026 OR (p_review_year = 2026 AND v_month_num < 5) THEN
    RAISE EXCEPTION 'Cannot correct KPIs before May 2026. Past data is frozen.';
  END IF;

  -- Capture before-image (id + prior kpi_definition_id) for kpis
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id', id, 'prev_definition_id', kpi_definition_id)), '[]'::jsonb)
    INTO v_kpi_before
  FROM public.kpis
  WHERE category_id = p_category_id
    AND kra_name = p_old_kra
    AND kpi_name = p_old_kpi
    AND review_period = p_review_period
    AND review_year = p_review_year;

  -- Capture before-image for org_kpi_values
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id', id)), '[]'::jsonb)
    INTO v_org_before
  FROM public.org_kpi_values
  WHERE category_id = p_category_id
    AND kra_name = p_old_kra
    AND kpi_name = p_old_kpi
    AND review_period = p_review_period
    AND review_year = p_review_year;

  UPDATE public.kpis
  SET kra_name = p_new_kra,
      kpi_name = p_new_kpi,
      kpi_definition_id = p_definition_id,
      updated_at = now()
  WHERE category_id = p_category_id
    AND kra_name = p_old_kra
    AND kpi_name = p_old_kpi
    AND review_period = p_review_period
    AND review_year = p_review_year;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  UPDATE public.org_kpi_values
  SET kra_name = p_new_kra,
      kpi_name = p_new_kpi,
      updated_at = now()
  WHERE category_id = p_category_id
    AND kra_name = p_old_kra
    AND kpi_name = p_old_kpi
    AND review_period = p_review_period
    AND review_year = p_review_year;

  GET DIAGNOSTICS v_org_count = ROW_COUNT;

  -- Log action with full before-image so undo can revert
  INSERT INTO public.kpi_standardization_actions
    (action_type, definition_id, category_id, payload, affected_row_count, performed_by)
  VALUES (
    'rename_kpis',
    p_definition_id,
    p_category_id,
    jsonb_build_object(
      'old_kra', p_old_kra,
      'old_kpi', p_old_kpi,
      'new_kra', p_new_kra,
      'new_kpi', p_new_kpi,
      'review_period', p_review_period,
      'review_year', p_review_year,
      'kpi_rows', v_kpi_before,
      'org_kpi_rows', v_org_before,
      'org_kpi_count', v_org_count
    ),
    v_count,
    auth.uid()
  );

  RETURN v_count;
END;
$$;

-- ----- Reverse function -----
CREATE OR REPLACE FUNCTION public.reverse_standardization_action(p_action_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_action public.kpi_standardization_actions%ROWTYPE;
  v_payload jsonb;
  v_kpi_row jsonb;
  v_count integer := 0;
  v_def_exists boolean;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN
    RAISE EXCEPTION 'Only admins can reverse standardization actions';
  END IF;

  SELECT * INTO v_action FROM public.kpi_standardization_actions WHERE id = p_action_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Action not found'; END IF;
  IF v_action.reversed_at IS NOT NULL THEN
    RAISE EXCEPTION 'Action already reversed at %', v_action.reversed_at;
  END IF;

  v_payload := v_action.payload;

  IF v_action.action_type = 'rename_kpis' THEN
    -- Restore each kpi row's prior kra_name/kpi_name + kpi_definition_id
    FOR v_kpi_row IN SELECT * FROM jsonb_array_elements(COALESCE(v_payload->'kpi_rows','[]'::jsonb))
    LOOP
      UPDATE public.kpis
      SET kra_name = v_payload->>'old_kra',
          kpi_name = v_payload->>'old_kpi',
          kpi_definition_id = NULLIF(v_kpi_row->>'prev_definition_id','')::uuid,
          updated_at = now()
      WHERE id = (v_kpi_row->>'id')::uuid;
      v_count := v_count + 1;
    END LOOP;

    UPDATE public.org_kpi_values
    SET kra_name = v_payload->>'old_kra',
        kpi_name = v_payload->>'old_kpi',
        updated_at = now()
    WHERE category_id = v_action.category_id
      AND kra_name = v_payload->>'new_kra'
      AND kpi_name = v_payload->>'new_kpi'
      AND review_period = v_payload->>'review_period'
      AND review_year = (v_payload->>'review_year')::integer;

  ELSIF v_action.action_type = 'create_definition' THEN
    -- Refuse if any kpis still reference this definition
    IF EXISTS (SELECT 1 FROM public.kpis WHERE kpi_definition_id = v_action.definition_id) THEN
      RAISE EXCEPTION 'Cannot undo: % KPI rows still link to this definition. Unlink them first.',
        (SELECT COUNT(*) FROM public.kpis WHERE kpi_definition_id = v_action.definition_id);
    END IF;
    DELETE FROM public.kpi_definitions WHERE id = v_action.definition_id;
    v_count := 1;

  ELSIF v_action.action_type = 'link_alias' THEN
    -- payload.aliases = [{variant_kra_name, variant_kpi_name, category_id}]
    DELETE FROM public.kpi_name_aliases a
    USING jsonb_to_recordset(COALESCE(v_payload->'aliases','[]'::jsonb))
      AS x(variant_kra_name text, variant_kpi_name text, category_id uuid)
    WHERE a.definition_id = v_action.definition_id
      AND a.variant_kra_name = x.variant_kra_name
      AND a.variant_kpi_name = x.variant_kpi_name
      AND a.category_id = x.category_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;

  ELSIF v_action.action_type = 'unlink_alias' THEN
    INSERT INTO public.kpi_name_aliases (definition_id, variant_kra_name, variant_kpi_name, category_id)
    SELECT v_action.definition_id, x.variant_kra_name, x.variant_kpi_name, x.category_id
    FROM jsonb_to_recordset(COALESCE(v_payload->'aliases','[]'::jsonb))
      AS x(variant_kra_name text, variant_kpi_name text, category_id uuid)
    ON CONFLICT (variant_kra_name, variant_kpi_name, category_id) DO NOTHING;
    GET DIAGNOSTICS v_count = ROW_COUNT;

  ELSIF v_action.action_type = 'delete_definition' THEN
    -- Recreate definition + aliases from snapshot
    SELECT EXISTS(SELECT 1 FROM public.kpi_definitions WHERE id = v_action.definition_id) INTO v_def_exists;
    IF NOT v_def_exists THEN
      INSERT INTO public.kpi_definitions (id, canonical_kra_name, canonical_kpi_name, category_id)
      VALUES (
        v_action.definition_id,
        v_payload->'definition'->>'canonical_kra_name',
        v_payload->'definition'->>'canonical_kpi_name',
        (v_payload->'definition'->>'category_id')::uuid
      );
    END IF;
    INSERT INTO public.kpi_name_aliases (definition_id, variant_kra_name, variant_kpi_name, category_id)
    SELECT v_action.definition_id, x.variant_kra_name, x.variant_kpi_name, x.category_id
    FROM jsonb_to_recordset(COALESCE(v_payload->'aliases','[]'::jsonb))
      AS x(variant_kra_name text, variant_kpi_name text, category_id uuid)
    ON CONFLICT (variant_kra_name, variant_kpi_name, category_id) DO NOTHING;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_count := v_count + 1;

  ELSIF v_action.action_type = 'edit_definition' THEN
    -- Restore prior canonical names
    UPDATE public.kpi_definitions
    SET canonical_kra_name = v_payload->'before'->>'canonical_kra_name',
        canonical_kpi_name = v_payload->'before'->>'canonical_kpi_name',
        updated_at = now()
    WHERE id = v_action.definition_id;
    v_count := 1;
  ELSE
    RAISE EXCEPTION 'Unknown action_type: %', v_action.action_type;
  END IF;

  UPDATE public.kpi_standardization_actions
  SET reversed_at = now(),
      reversed_by = auth.uid()
  WHERE id = p_action_id;

  RETURN jsonb_build_object('reversed', true, 'action_type', v_action.action_type, 'affected', v_count);
END;
$$;

GRANT EXECUTE ON FUNCTION public.log_standardization_action(text,uuid,uuid,jsonb,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reverse_standardization_action(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.org_kpi_chain_upsert(
  p_category_id uuid,
  p_kra_name text,
  p_kpi_name text,
  p_steps jsonb,
  p_propagation_mode text DEFAULT 'central_fed',
  p_cutoff_day integer DEFAULT NULL,
  p_effective_from date DEFAULT CURRENT_DATE
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_user uuid := auth.uid();
  v_item jsonb;
  v_n int := 0;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.has_role(v_user, 'admin'::public.app_role) THEN
    RETURN jsonb_build_object('authorized', false);
  END IF;
  IF COALESCE(p_propagation_mode, 'central_fed') NOT IN ('central_fed','central_approved') THEN
    RAISE EXCEPTION 'Unsupported propagation mode: %', p_propagation_mode;
  END IF;

  INSERT INTO public.org_kpi_central_registry
    (category_id, kra_name, kpi_name, propagation_mode, cutoff_day, is_active, created_by)
  VALUES (p_category_id, p_kra_name, p_kpi_name,
          COALESCE(p_propagation_mode,'central_fed'), p_cutoff_day, true, v_user)
  ON CONFLICT (category_id, public.normalize_kpi_text(kra_name), public.normalize_kpi_text(kpi_name))
  DO UPDATE SET propagation_mode = EXCLUDED.propagation_mode,
                cutoff_day = EXCLUDED.cutoff_day,
                is_active = true,
                updated_at = now();

  DELETE FROM public.org_kpi_approval_chains c
  WHERE c.category_id = p_category_id
    AND public.normalize_kpi_text(c.kra_name) = public.normalize_kpi_text(p_kra_name)
    AND public.normalize_kpi_text(c.kpi_name) = public.normalize_kpi_text(p_kpi_name)
    AND c.effective_from = p_effective_from;

  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(p_steps, '[]'::jsonb))
  LOOP
    v_n := v_n + 1;
    INSERT INTO public.org_kpi_approval_chains
      (category_id, kra_name, kpi_name, effective_from, step_no, step_kind,
       approver_id, approver_role, label, created_by)
    VALUES (
      p_category_id, p_kra_name, p_kpi_name, p_effective_from,
      COALESCE((v_item->>'step_no')::int, v_n),
      COALESCE(v_item->>'step_kind', CASE WHEN v_n = 1 THEN 'provider' ELSE 'approver' END),
      NULLIF(v_item->>'approver_id','')::uuid,
      NULLIF(v_item->>'approver_role','')::public.app_role,
      COALESCE(NULLIF(btrim(v_item->>'label'),''), 'Step ' || v_n),
      v_user
    );
  END LOOP;

  RETURN jsonb_build_object('authorized', true, 'steps_saved', v_n,
                            'effective_from', p_effective_from,
                            'propagation_mode', COALESCE(p_propagation_mode,'central_fed'));
END;
$$;
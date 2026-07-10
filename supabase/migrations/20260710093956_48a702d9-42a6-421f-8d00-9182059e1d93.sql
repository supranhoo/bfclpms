DO $$
DECLARE
  v_dept_id uuid := '4adbb676-3514-4bcd-ad31-cab494ce45cf';
  v_new_head uuid;
  v_updated int;
BEGIN
  SELECT head_user_id INTO v_new_head FROM public.departments WHERE id = v_dept_id;
  IF v_new_head IS NULL THEN
    RAISE EXCEPTION 'Admin-Pollution has no head_user_id configured';
  END IF;

  WITH upd AS (
    UPDATE public.annual_review_instances ari
       SET dept_head_id = v_new_head,
           updated_at   = now()
      FROM public.profiles p
     WHERE ari.employee_id = p.id
       AND p.department_id = v_dept_id
       AND ari.finalized_at IS NULL
       AND ari.dept_head_id IS DISTINCT FROM v_new_head
    RETURNING ari.id
  )
  SELECT count(*) INTO v_updated FROM upd;

  INSERT INTO public.system_audit_logs (action, performed_by, metadata)
  VALUES (
    'annual_review.dept_head.resynced',
    NULL,
    jsonb_build_object(
      'department_id', v_dept_id,
      'department_name', 'Admin-Pollution',
      'new_dept_head_id', v_new_head,
      'instances_updated', v_updated,
      'scope', 'non_finalized_only'
    )
  );
END $$;
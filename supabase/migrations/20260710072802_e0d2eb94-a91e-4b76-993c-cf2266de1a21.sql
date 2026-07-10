
-- Resync stale bu_head_id / dept_head_id on non-completed annual review instances
-- after the 2026-07-10 department re-parenting to the new BU set.
DO $$
DECLARE
  v_row RECORD;
  v_new_bu_head UUID;
  v_new_dept_head UUID;
BEGIN
  FOR v_row IN
    SELECT ari.id AS instance_id,
           ari.employee_id,
           ari.bu_head_id AS old_bu_head,
           ari.dept_head_id AS old_dept_head,
           d.head_user_id AS dept_head_now,
           bu.head_user_id AS bu_head_now
      FROM public.annual_review_instances ari
      JOIN public.profiles p ON p.id = ari.employee_id
      LEFT JOIN public.departments d ON d.id = p.department_id
      LEFT JOIN public.business_units bu ON bu.id = d.business_unit_id
     WHERE ari.overall_status <> 'completed'
       AND (
             ari.bu_head_id IS DISTINCT FROM bu.head_user_id
          OR ari.dept_head_id IS DISTINCT FROM d.head_user_id
       )
  LOOP
    v_new_bu_head := v_row.bu_head_now;
    v_new_dept_head := v_row.dept_head_now;

    UPDATE public.annual_review_instances
       SET bu_head_id = v_new_bu_head,
           dept_head_id = v_new_dept_head
     WHERE id = v_row.instance_id;

    INSERT INTO public.system_audit_logs(action, performed_by, metadata)
    VALUES (
      'org.review_instance.head_resync',
      NULL,
      jsonb_build_object(
        'instance_id', v_row.instance_id,
        'employee_id', v_row.employee_id,
        'old_bu_head_id', v_row.old_bu_head,
        'new_bu_head_id', v_new_bu_head,
        'old_dept_head_id', v_row.old_dept_head,
        'new_dept_head_id', v_new_dept_head,
        'source', 'bu-reparent-2026-07-10'
      )
    );
  END LOOP;
END $$;

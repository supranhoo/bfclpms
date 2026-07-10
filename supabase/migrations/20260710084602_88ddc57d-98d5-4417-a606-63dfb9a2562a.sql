DO $$
DECLARE
  v_old uuid;
  v_new uuid := 'ad55b362-9023-44bc-9da5-871d3e4d7499';
BEGIN
  SELECT hr_business_unit_id INTO v_old FROM public.org_head_config LIMIT 1;

  UPDATE public.org_head_config
  SET hr_business_unit_id = v_new,
      updated_at = now();

  INSERT INTO public.system_audit_logs (action, performed_by, metadata)
  VALUES (
    'org.hr_business_unit.repointed',
    NULL,
    jsonb_build_object(
      'old_hr_business_unit_id', v_old,
      'new_hr_business_unit_id', v_new,
      'reason', 'HR BU pointer was set to 1050 TPD; corrected to actual HR BU so HR-Team resolver grants directory + Team Annual Review access'
    )
  );
END $$;
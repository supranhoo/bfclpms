
DO $$
DECLARE
  v_map jsonb := '[
    {"dept":"6181f85c-51f6-4000-8ef1-5b45e17b79ff","old":"53100aa5-b173-4e0b-8a15-d6af94b50c68","new":"5cbdc8b1"},
    {"dept":"a4f98c64-4938-42a5-99f4-8432dbbeccbe","old":null,"new":"6c6b4ff4"},
    {"dept":"cce2eb8f-2ff6-43ed-a034-b9b703d25c53","old":"53100aa5-b173-4e0b-8a15-d6af94b50c68","new":"0e576177"},
    {"dept":"52bb558c-0dfc-49dd-98ea-96aa27f8de37","old":"e7989c20-438d-4ddb-a320-cb9ec2286770","new":"1897f3e7"},
    {"dept":"de11e503-5c13-425d-99f7-47e1eea4513f","old":"76e307df-3599-477d-b31f-27fa760e493a","new":"ec44a278"},
    {"dept":"fa1304fb-259d-4b9a-9c42-1e7752ffeb8b","old":"e7989c20-438d-4ddb-a320-cb9ec2286770","new":"7e5d47dc"},
    {"dept":"bdce986b-d179-4321-ab78-5b56fd91ff60","old":"e7989c20-438d-4ddb-a320-cb9ec2286770","new":"ff73b404"},
    {"dept":"ba573c3a-0fed-4a3e-866a-ed9eeaa98f32","old":"e7989c20-438d-4ddb-a320-cb9ec2286770","new":"ff73b404"},
    {"dept":"a437beb2-a880-4c2e-889e-0248b6c4d6dd","old":"e7989c20-438d-4ddb-a320-cb9ec2286770","new":"ff73b404"},
    {"dept":"ac4e5a39-eb1a-4ce4-b609-25e9684b278d","old":"e7989c20-438d-4ddb-a320-cb9ec2286770","new":"8a055937"},
    {"dept":"8f691365-bd23-4392-8be5-0eea64ebcbac","old":"e7989c20-438d-4ddb-a320-cb9ec2286770","new":"9c54015f"},
    {"dept":"8a986bef-93c2-49de-9479-122dc123c27d","old":"c889b230-4b09-4975-9d8c-55d64888c3ed","new":"8f54666c"},
    {"dept":"1b0d6e6f-3a3f-4d12-87ed-f40e485164e0","old":"c889b230-4b09-4975-9d8c-55d64888c3ed","new":"f283c35c"},
    {"dept":"d9027355-e05b-4038-bd75-23dcec5b882a","old":"c889b230-4b09-4975-9d8c-55d64888c3ed","new":"4ac31aac"},
    {"dept":"43652d65-af63-4435-a870-2948dfddfdfb","old":"d5edabec-a95e-4138-ac40-0d4c75f9d7f5","new":"2177f1ef"},
    {"dept":"0b14100f-2585-4893-b1f9-7a014e130547","old":"d5edabec-a95e-4138-ac40-0d4c75f9d7f5","new":"d41c3547"},
    {"dept":"0e5ea4f4-a329-4ad8-b195-777d2802a51d","old":"d5edabec-a95e-4138-ac40-0d4c75f9d7f5","new":"be385832"}
  ]'::jsonb;
  r jsonb;
  v_new_bu uuid;
  v_old_bu uuid;
  v_dept uuid;
BEGIN
  FOR r IN SELECT * FROM jsonb_array_elements(v_map)
  LOOP
    v_dept := (r->>'dept')::uuid;
    v_old_bu := NULLIF(r->>'old','')::uuid;

    SELECT id INTO v_new_bu
      FROM public.business_units
     WHERE id::text LIKE (r->>'new') || '%'
       AND created_at::date = '2026-07-10'
     LIMIT 1;

    IF v_new_bu IS NULL THEN
      RAISE EXCEPTION 'No new BU found for prefix % (dept %)', r->>'new', v_dept;
    END IF;

    INSERT INTO public.system_audit_logs(action, performed_by, metadata)
    VALUES (
      'org.department.reparent',
      NULL,
      jsonb_build_object(
        'dept_id', v_dept,
        'old_bu_id', v_old_bu,
        'new_bu_id', v_new_bu,
        'source', 'employee-master-2026-07-10'
      )
    );

    UPDATE public.departments
       SET business_unit_id = v_new_bu
     WHERE id = v_dept
       AND business_unit_id IS NOT DISTINCT FROM v_old_bu;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Guarded UPDATE missed dept % (expected old bu %)', v_dept, v_old_bu;
    END IF;
  END LOOP;
END $$;

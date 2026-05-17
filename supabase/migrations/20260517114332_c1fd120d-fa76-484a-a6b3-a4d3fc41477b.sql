
ALTER TABLE public.kpis DISABLE TRIGGER kpi_frequency_lock_check;

DO $$
DECLARE
  v_misfire_ids uuid[] := ARRAY[
    'b90f3584-8470-49c7-aa09-0ee1e256000b'::uuid,
    '1ce0a74b-179c-4969-b8c0-7ab3a1897849'::uuid,
    '3d2e93a1-b2be-41cc-a1f4-3a79729c4444'::uuid,
    '1a2114d9-2faa-43a8-b302-6be9555ff506'::uuid,
    'bdc1b8a0-467d-4d26-95cc-8b60e43b62c7'::uuid,
    '3020d87f-3a44-44a9-8649-2922454eb4a2'::uuid,
    'dcc8b7b7-7b91-4725-a0fa-79cd97aeed37'::uuid,
    'd42cfb9c-b142-42c4-b5a0-c1d3113e8510'::uuid,
    '229c607c-3b6e-4637-b70c-af79a3f319ea'::uuid,
    'eb029c22-f231-4980-b94c-f865328cea6e'::uuid,
    'd36576bd-124f-4bf3-92f7-634ced15ee39'::uuid
  ];
  v_repaired int;
BEGIN
  CREATE TEMP TABLE _latest_cascade ON COMMIT DROP AS
  SELECT DISTINCT ON (al.kpi_id)
    al.kpi_id, al.id AS audit_id,
    al.old_value->>'status' AS old_status,
    al.new_value->>'status' AS cascaded_status,
    al.metadata
  FROM kpi_audit_logs al
  WHERE al.action='SIBLING_STEP_BACK' AND al.kpi_id = ANY(v_misfire_ids)
  ORDER BY al.kpi_id, al.created_at DESC;

  CREATE TEMP TABLE _safe_repair ON COMMIT DROP AS
  SELECT lc.* FROM _latest_cascade lc
  JOIN kpis k ON k.id = lc.kpi_id
  WHERE k.status::text = lc.cascaded_status;

  UPDATE kpis k
  SET status = sr.old_status::review_status, updated_at = now()
  FROM _safe_repair sr WHERE k.id = sr.kpi_id;

  INSERT INTO kpi_audit_logs (kpi_id, action, performed_by, on_behalf_of, on_behalf_role, old_value, new_value, metadata)
  SELECT sr.kpi_id, 'SIBLING_STEP_BACK_REVERSED', NULL, NULL, 'system',
    jsonb_build_object('status', sr.cascaded_status),
    jsonb_build_object('status', sr.old_status),
    jsonb_build_object(
      'reason','Cycle-scoped sibling cascade repair — original SIBLING_STEP_BACK crossed cycle boundary',
      'original_audit_id', sr.audit_id::text,
      'original_metadata', sr.metadata,
      'repair_migration','20260517_repair_misfired_sibling_cascades'
    )
  FROM _safe_repair sr;

  SELECT count(*) INTO v_repaired FROM _safe_repair;
  RAISE NOTICE 'Repaired % misfired sibling cascade rows', v_repaired;
END $$;

ALTER TABLE public.kpis ENABLE TRIGGER kpi_frequency_lock_check;

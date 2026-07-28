-- ADR-196 §2: bulk_write_stage_scores — persist functional_manager_achieved_value
-- (peer parity with manager/skip_level/hr_pms/auditor). Applied as a precise,
-- assertion-guarded rewrite of the existing definition so no unrelated logic drifts.
DO $do$
DECLARE
  v_def text;
  v_na_old text := E'           SET functional_manager_score = NULL, functional_manager_rating = NULL, functional_manager_remarks = NULL,\n               functional_manager_evidence_urls =';
  v_na_new text := E'           SET functional_manager_score = NULL, functional_manager_rating = NULL, functional_manager_remarks = NULL,\n               functional_manager_achieved_value = NULL,\n               functional_manager_evidence_urls =';
  v_sc_old text := E'             functional_manager_remarks = v_effective_remarks,\n             functional_manager_evidence_urls =';
  v_sc_new text := E'             functional_manager_remarks = v_effective_remarks,\n             functional_manager_achieved_value = v_mirror_achieved,\n             functional_manager_evidence_urls =';
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'bulk_write_stage_scores' AND p.pronargs = 10;

  IF v_def IS NULL THEN
    RAISE EXCEPTION 'bulk_write_stage_scores/10 not found';
  END IF;

  IF position(v_na_old in v_def) = 0 OR position(v_sc_old in v_def) = 0 THEN
    RAISE EXCEPTION 'expected functional_manager branches not found — aborting rewrite';
  END IF;

  v_def := replace(v_def, v_na_old, v_na_new);
  v_def := replace(v_def, v_sc_old, v_sc_new);

  IF (length(v_def) - length(replace(v_def, 'functional_manager_achieved_value', ''))) / length('functional_manager_achieved_value') <> 2 THEN
    RAISE EXCEPTION 'unexpected number of functional_manager_achieved_value references';
  END IF;

  EXECUTE v_def;
END
$do$;
-- One-time backfill of missing per-stage kpi_audit_logs rows for Jan 2026 → present.
-- Pure INSERT-only. No table is updated or deleted. Idempotent via WHERE NOT EXISTS.
-- Every value is copied verbatim from review_submissions; no fabrication or interpolation.
-- Timestamps anchor only to review_submissions.submitted_at (real) and updated_at (real
-- for the last-completed stage). Intermediate stages carry metadata.timestamp_known=false.
-- Rollback: DELETE FROM kpi_audit_logs WHERE action LIKE 'BACKFILL_%' AND metadata->>'run_id' = '<uuid>';

DO $backfill$
DECLARE
  v_run_id uuid := gen_random_uuid();
  v_reason text := 'historical_import_gap_jan2026_onwards';
  v_self int; v_mgr int; v_skip int; v_hr int; v_aud int; v_mgmt int;
BEGIN
  RAISE NOTICE 'Backfill run_id = %', v_run_id;

  -- Per-KPI computed "last completed stage" anchor.
  -- Canonical workflow order: self < manager < skip_level < hr_pms < audit < management.
  -- Materialized into a temp table so each per-stage INSERT can join cheaply.
  CREATE TEMP TABLE _bf_rs ON COMMIT DROP AS
  SELECT
    rs.kpi_id,
    rs.id              AS submission_id,
    rs.submitted_at,
    rs.updated_at,
    rs.self_score,             rs.self_rating,             rs.self_remarks,             rs.achieved_value          AS self_achieved,
    rs.manager_score,          rs.manager_rating,          rs.manager_remarks,          rs.manager_achieved_value,
    rs.skip_level_score,       rs.skip_level_rating,       rs.skip_level_remarks,       rs.skip_level_achieved_value,
    rs.hr_pms_score,           rs.hr_pms_rating,           rs.hr_pms_remarks,           rs.hr_pms_achieved_value,
    rs.auditor_score,          rs.auditor_rating,          rs.auditor_remarks,          rs.auditor_achieved_value,
    rs.management_score,       rs.management_rating,       rs.management_remarks,       rs.management_achieved_value,
    CASE
      WHEN rs.management_score  IS NOT NULL THEN 'management_review'
      WHEN rs.auditor_score     IS NOT NULL THEN 'audit'
      WHEN rs.hr_pms_score      IS NOT NULL THEN 'hr_pms_review'
      WHEN rs.skip_level_score  IS NOT NULL THEN 'skip_level_check'
      WHEN rs.manager_score     IS NOT NULL THEN 'manager_check'
      WHEN rs.self_score        IS NOT NULL THEN 'self_review'
    END AS last_stage
  FROM public.review_submissions rs
  JOIN public.kpis k ON k.id = rs.kpi_id
  WHERE k.review_year >= 2026;   -- Jan-2026 cutoff per governance memory

  CREATE INDEX ON _bf_rs (kpi_id);

  --------------------------------------------------------------------------------
  -- Stage 1 : SELF  (timestamp_known=true, anchored to submitted_at — real)
  --------------------------------------------------------------------------------
  WITH ins AS (
    INSERT INTO public.kpi_audit_logs
      (kpi_id, submission_id, action, performed_by, old_value, new_value, metadata, created_at)
    SELECT
      r.kpi_id, r.submission_id, 'BACKFILL_SELF_REVIEW_SUBMITTED', NULL, NULL,
      jsonb_build_object(
        'stage_score',    r.self_score,
        'stage_rating',   r.self_rating,
        'achieved_value', r.self_achieved,
        'stage_remarks',  r.self_remarks,
        'status',         'self_review'
      ),
      jsonb_build_object(
        'source','submission_backfill', 'reason', v_reason, 'run_id', v_run_id,
        'timestamp_known', true,
        'observed_submitted_at', r.submitted_at,
        'observed_updated_at',   r.updated_at
      ),
      r.submitted_at
    FROM _bf_rs r
    WHERE r.self_score IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.kpi_audit_logs l
         WHERE l.kpi_id = r.kpi_id
           AND l.action IN ('SELF_REVIEW_SUBMITTED','BACKFILL_SELF_REVIEW_SUBMITTED','ADMIN_DATA_ENTRY_SELF')
      )
    RETURNING 1
  ) SELECT count(*) INTO v_self FROM ins;

  --------------------------------------------------------------------------------
  -- Stage 2 : MANAGER
  --------------------------------------------------------------------------------
  WITH ins AS (
    INSERT INTO public.kpi_audit_logs
      (kpi_id, submission_id, action, performed_by, old_value, new_value, metadata, created_at)
    SELECT
      r.kpi_id, r.submission_id, 'BACKFILL_MANAGER_REVIEWED', NULL, NULL,
      jsonb_build_object(
        'stage_score',    r.manager_score,
        'stage_rating',   r.manager_rating,
        'achieved_value', r.manager_achieved_value,
        'stage_remarks',  r.manager_remarks,
        'status',         'manager_check'
      ),
      jsonb_build_object(
        'source','submission_backfill', 'reason', v_reason, 'run_id', v_run_id,
        'timestamp_known', (r.last_stage = 'manager_check'),
        'observed_submitted_at', r.submitted_at,
        'observed_updated_at',   r.updated_at
      ),
      CASE WHEN r.last_stage = 'manager_check' THEN r.updated_at ELSE r.submitted_at END
    FROM _bf_rs r
    WHERE r.manager_score IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.kpi_audit_logs l
         WHERE l.kpi_id = r.kpi_id
           AND l.action IN (
             'MANAGER_FORWARDED','MANAGER_REVIEWED','MANAGER_APPROVED',
             'MANAGER_NA_CONFIRMED','MANAGER_MARKED_NA',
             'ADMIN_DATA_ENTRY_MANAGER','BACKFILL_MANAGER_REVIEWED'
           )
      )
    RETURNING 1
  ) SELECT count(*) INTO v_mgr FROM ins;

  --------------------------------------------------------------------------------
  -- Stage 3 : SKIP-LEVEL
  --------------------------------------------------------------------------------
  WITH ins AS (
    INSERT INTO public.kpi_audit_logs
      (kpi_id, submission_id, action, performed_by, old_value, new_value, metadata, created_at)
    SELECT
      r.kpi_id, r.submission_id, 'BACKFILL_SKIP_LEVEL_REVIEWED', NULL, NULL,
      jsonb_build_object(
        'stage_score',    r.skip_level_score,
        'stage_rating',   r.skip_level_rating,
        'achieved_value', r.skip_level_achieved_value,
        'stage_remarks',  r.skip_level_remarks,
        'status',         'skip_level_check'
      ),
      jsonb_build_object(
        'source','submission_backfill', 'reason', v_reason, 'run_id', v_run_id,
        'timestamp_known', (r.last_stage = 'skip_level_check'),
        'observed_submitted_at', r.submitted_at,
        'observed_updated_at',   r.updated_at
      ),
      CASE WHEN r.last_stage = 'skip_level_check' THEN r.updated_at ELSE r.submitted_at END
    FROM _bf_rs r
    WHERE r.skip_level_score IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.kpi_audit_logs l
         WHERE l.kpi_id = r.kpi_id
           AND l.action IN (
             'SKIP_LEVEL_FORWARDED','SKIP_LEVEL_REVIEWED',
             'SKIP_LEVEL_NA_CONFIRMED','SKIP_LEVEL_MARKED_NA',
             'BACKFILL_SKIP_LEVEL_REVIEWED'
           )
      )
    RETURNING 1
  ) SELECT count(*) INTO v_skip FROM ins;

  --------------------------------------------------------------------------------
  -- Stage 4 : HR PMS
  --------------------------------------------------------------------------------
  WITH ins AS (
    INSERT INTO public.kpi_audit_logs
      (kpi_id, submission_id, action, performed_by, old_value, new_value, metadata, created_at)
    SELECT
      r.kpi_id, r.submission_id, 'BACKFILL_HR_PMS_REVIEWED', NULL, NULL,
      jsonb_build_object(
        'stage_score',    r.hr_pms_score,
        'stage_rating',   r.hr_pms_rating,
        'achieved_value', r.hr_pms_achieved_value,
        'stage_remarks',  r.hr_pms_remarks,
        'status',         'hr_pms_review'
      ),
      jsonb_build_object(
        'source','submission_backfill', 'reason', v_reason, 'run_id', v_run_id,
        'timestamp_known', (r.last_stage = 'hr_pms_review'),
        'observed_submitted_at', r.submitted_at,
        'observed_updated_at',   r.updated_at
      ),
      CASE WHEN r.last_stage = 'hr_pms_review' THEN r.updated_at ELSE r.submitted_at END
    FROM _bf_rs r
    WHERE r.hr_pms_score IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.kpi_audit_logs l
         WHERE l.kpi_id = r.kpi_id
           AND l.action IN (
             'HR_PMS_FORWARDED','HR_PMS_REVIEWED',
             'HR_PMS_NA_CONFIRMED','HR_PMS_MARKED_NA',
             'ADMIN_DATA_ENTRY_HR_PMS','BACKFILL_HR_PMS_REVIEWED',
             'BULK_STAGE_SIGNOFF_HR_PMS','BULK_NA_MARK_HR_PMS'
           )
      )
    RETURNING 1
  ) SELECT count(*) INTO v_hr FROM ins;

  --------------------------------------------------------------------------------
  -- Stage 5 : AUDITOR
  --------------------------------------------------------------------------------
  WITH ins AS (
    INSERT INTO public.kpi_audit_logs
      (kpi_id, submission_id, action, performed_by, old_value, new_value, metadata, created_at)
    SELECT
      r.kpi_id, r.submission_id, 'BACKFILL_AUDITOR_REVIEWED', NULL, NULL,
      jsonb_build_object(
        'stage_score',    r.auditor_score,
        'stage_rating',   r.auditor_rating,
        'achieved_value', r.auditor_achieved_value,
        'stage_remarks',  r.auditor_remarks,
        'status',         'audit'
      ),
      jsonb_build_object(
        'source','submission_backfill', 'reason', v_reason, 'run_id', v_run_id,
        'timestamp_known', (r.last_stage = 'audit'),
        'observed_submitted_at', r.submitted_at,
        'observed_updated_at',   r.updated_at
      ),
      CASE WHEN r.last_stage = 'audit' THEN r.updated_at ELSE r.submitted_at END
    FROM _bf_rs r
    WHERE r.auditor_score IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.kpi_audit_logs l
         WHERE l.kpi_id = r.kpi_id
           AND l.action IN (
             'AUDITOR_REVIEWED','AUDITOR_FORWARDED','AUDITOR_APPROVED',
             'AUDITOR_NA_CONFIRMED','AUDITOR_MARKED_NA',
             'ADMIN_DATA_ENTRY_AUDITOR','BACKFILL_AUDITOR_REVIEWED'
           )
      )
    RETURNING 1
  ) SELECT count(*) INTO v_aud FROM ins;

  --------------------------------------------------------------------------------
  -- Stage 6 : MANAGEMENT
  --------------------------------------------------------------------------------
  WITH ins AS (
    INSERT INTO public.kpi_audit_logs
      (kpi_id, submission_id, action, performed_by, old_value, new_value, metadata, created_at)
    SELECT
      r.kpi_id, r.submission_id, 'BACKFILL_MANAGEMENT_REVIEWED', NULL, NULL,
      jsonb_build_object(
        'stage_score',    r.management_score,
        'stage_rating',   r.management_rating,
        'achieved_value', r.management_achieved_value,
        'stage_remarks',  r.management_remarks,
        'status',         'management_review'
      ),
      jsonb_build_object(
        'source','submission_backfill', 'reason', v_reason, 'run_id', v_run_id,
        'timestamp_known', (r.last_stage = 'management_review'),
        'observed_submitted_at', r.submitted_at,
        'observed_updated_at',   r.updated_at
      ),
      CASE WHEN r.last_stage = 'management_review' THEN r.updated_at ELSE r.submitted_at END
    FROM _bf_rs r
    WHERE r.management_score IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.kpi_audit_logs l
         WHERE l.kpi_id = r.kpi_id
           AND l.action IN (
             'MANAGEMENT_REVIEWED','MANAGEMENT_APPROVED',
             'MANAGEMENT_NA_CONFIRMED',
             'ADMIN_DATA_ENTRY_MANAGEMENT','BACKFILL_MANAGEMENT_REVIEWED',
             'ADMIN_BULK_OVERRIDE_FORCE_APPROVE'
           )
      )
    RETURNING 1
  ) SELECT count(*) INTO v_mgmt FROM ins;

  RAISE NOTICE 'BACKFILL COMPLETE run_id=% | self=% manager=% skip_level=% hr_pms=% auditor=% management=%',
    v_run_id, v_self, v_mgr, v_skip, v_hr, v_aud, v_mgmt;
END
$backfill$;
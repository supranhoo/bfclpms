-- Backfill missing batch_reason on today's bulk-override side-effect audit rows
-- so the Review Timeline "Remark" block surfaces for every employee touched
-- by today's HR PMS / Admin bulk override batches.

-- 1) BULK_OVERRIDE_STAGE_RESTAMPED: copy batch_reason from its origin FINAL_RESTAMP row.
UPDATE public.kpi_audit_logs r
SET metadata = coalesce(r.metadata, '{}'::jsonb)
            || jsonb_build_object('batch_reason', o.metadata->>'batch_reason')
FROM public.kpi_audit_logs o
WHERE r.created_at::date = current_date
  AND r.action = 'BULK_OVERRIDE_STAGE_RESTAMPED'
  AND (NOT (r.metadata ? 'batch_reason')
       OR length(btrim(coalesce(r.metadata->>'batch_reason',''))) = 0)
  AND r.metadata ? 'origin_log_id'
  AND o.id = (r.metadata->>'origin_log_id')::uuid
  AND o.metadata ? 'batch_reason'
  AND length(btrim(coalesce(o.metadata->>'batch_reason',''))) > 0;

-- 2) Today's ORG_KPI_VALUE_OVERWRITTEN side-effects: copy batch_reason from a sibling
-- ADMIN_BULK_OVERRIDE_FINAL_RESTAMP row sharing the same submission_id.
UPDATE public.kpi_audit_logs r
SET metadata = coalesce(r.metadata, '{}'::jsonb)
            || jsonb_build_object('batch_reason', s.batch_reason)
FROM (
  SELECT (metadata->>'submission_id')::uuid AS submission_id,
         max(metadata->>'batch_reason')      AS batch_reason
  FROM public.kpi_audit_logs
  WHERE created_at::date = current_date
    AND action = 'ADMIN_BULK_OVERRIDE_FINAL_RESTAMP'
    AND metadata ? 'submission_id'
    AND metadata ? 'batch_reason'
    AND length(btrim(coalesce(metadata->>'batch_reason',''))) > 0
  GROUP BY (metadata->>'submission_id')::uuid
) s
WHERE r.created_at::date = current_date
  AND r.action = 'ORG_KPI_VALUE_OVERWRITTEN'
  AND (NOT (r.metadata ? 'batch_reason')
       OR length(btrim(coalesce(r.metadata->>'batch_reason',''))) = 0)
  AND r.metadata ? 'submission_id'
  AND (r.metadata->>'submission_id')::uuid = s.submission_id;
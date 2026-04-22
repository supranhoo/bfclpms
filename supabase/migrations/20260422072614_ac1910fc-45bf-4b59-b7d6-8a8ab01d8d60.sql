
-- Part 1: SECURITY DEFINER function returning only "active" (post-advance) send-back markers
CREATE OR REPLACE FUNCTION public.get_active_send_back_markers(p_kpi_ids uuid[])
RETURNS TABLE(kpi_id uuid, reason text, created_at timestamptz, raised_by uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH last_advance AS (
    SELECT al.kpi_id, MAX(al.created_at) AS advanced_at
    FROM public.kpi_audit_logs al
    WHERE al.kpi_id = ANY(p_kpi_ids)
      AND al.action IN ('KPI_PROPAGATED','STATUS_ADVANCED','ORG_KPI_AUTOPULLED_FOR_LATE_JOINER','ORG_KPI_PROPAGATED')
    GROUP BY al.kpi_id
  )
  SELECT q.kpi_id, q.reason, q.created_at, q.raised_by
  FROM public.kpi_queries q
  LEFT JOIN last_advance la ON la.kpi_id = q.kpi_id
  JOIN public.kpis k ON k.id = q.kpi_id
  WHERE q.kpi_id = ANY(p_kpi_ids)
    AND q.query_type = 'send_back'
    AND k.status = 'kra_set'
    AND COALESCE(q.status::text, 'open') <> 'resolved'
    AND (la.advanced_at IS NULL OR q.created_at > la.advanced_at)
  ORDER BY q.created_at DESC;
$$;

-- Part 2: Auto-resolve trigger when KPI advances out of kra_set
CREATE OR REPLACE FUNCTION public.clear_send_back_marker_on_advance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer := 0;
BEGIN
  IF OLD.status = 'kra_set' AND NEW.status IS DISTINCT FROM 'kra_set' THEN
    UPDATE public.kpi_queries
       SET status = 'resolved',
           resolved_at = COALESCE(resolved_at, now()),
           updated_at = now()
     WHERE kpi_id = NEW.id
       AND query_type = 'send_back'
       AND COALESCE(status::text, 'open') <> 'resolved';

    GET DIAGNOSTICS v_count = ROW_COUNT;

    IF v_count > 0 THEN
      INSERT INTO public.kpi_audit_logs (kpi_id, action, performed_by, metadata, new_value)
      VALUES (
        NEW.id,
        'STALE_SENDBACK_MARKER_RESOLVED',
        NULL,
        jsonb_build_object(
          'resolved_count', v_count,
          'from_status', OLD.status,
          'to_status', NEW.status,
          'system_action', true,
          'reason', 'Auto-resolved on KPI advance past kra_set'
        ),
        jsonb_build_object('resolved_count', v_count)
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_clear_send_back_marker_on_advance ON public.kpis;
CREATE TRIGGER trg_clear_send_back_marker_on_advance
AFTER UPDATE OF status ON public.kpis
FOR EACH ROW
EXECUTE FUNCTION public.clear_send_back_marker_on_advance();

-- Part 3: One-shot backfill — resolve markers for KPIs already past kra_set
DO $$
DECLARE
  v_resolved integer := 0;
BEGIN
  WITH stale AS (
    SELECT q.id, q.kpi_id
    FROM public.kpi_queries q
    JOIN public.kpis k ON k.id = q.kpi_id
    WHERE q.query_type = 'send_back'
      AND k.status <> 'kra_set'
      AND COALESCE(q.status::text, 'open') <> 'resolved'
  ),
  upd AS (
    UPDATE public.kpi_queries q
       SET status = 'resolved',
           resolved_at = COALESCE(q.resolved_at, now()),
           updated_at = now()
      FROM stale s
     WHERE q.id = s.id
    RETURNING q.id, q.kpi_id
  )
  SELECT count(*) INTO v_resolved FROM upd;

  IF v_resolved > 0 THEN
    INSERT INTO public.kpi_audit_logs (kpi_id, action, performed_by, metadata, new_value)
    SELECT
      k.id,
      'STALE_SENDBACK_MARKER_RESOLVED',
      NULL,
      jsonb_build_object(
        'resolved_count', v_resolved,
        'system_action', true,
        'backfill', true,
        'reason', 'Bulk backfill of stale send-back markers (v2.66.7.7)'
      ),
      jsonb_build_object('summary', true, 'resolved_count', v_resolved)
    FROM public.kpis k
    LIMIT 1;
  END IF;

  RAISE NOTICE 'Resolved % stale send-back markers', v_resolved;
END $$;

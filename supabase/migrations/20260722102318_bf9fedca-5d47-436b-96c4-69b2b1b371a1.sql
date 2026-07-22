-- ADR-132 / POLICY §108f — Assignment-scoped KPI audit notification dispatch
-- RCA: notify_on_kpi_status_change broadcast kpi_ready_for_audit to every auditor.
-- The notification authorization guard correctly rejected unrelated auditors,
-- rolling back the parent KPI status update. Dispatch must select valid recipients.

CREATE OR REPLACE FUNCTION public.notify_on_kpi_status_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_employee_id UUID;
  v_manager_id UUID;
  v_kpi_name TEXT;
  v_kra_name TEXT;
  v_employee_name TEXT;
  v_employee_code TEXT;
  v_employee_display TEXT;
  v_final_score NUMERIC;
  v_final_score_text TEXT;
  v_send_back_reason TEXT;
BEGIN
  SELECT employee_id, kpi_name, kra_name INTO v_employee_id, v_kpi_name, v_kra_name
  FROM public.kpis WHERE id = NEW.id;

  SELECT full_name, employee_code, reporting_manager_id
  INTO v_employee_name, v_employee_code, v_manager_id
  FROM public.profiles WHERE id = v_employee_id;

  v_employee_display := COALESCE(v_employee_name, 'Employee');
  IF v_employee_code IS NOT NULL AND v_employee_code != '' THEN
    v_employee_display := v_employee_display || ' (' || v_employee_code || ')';
  END IF;

  IF NEW.status = 'kra_set' AND OLD.status IN ('self_review', 'manager_check', 'audit', 'management_review') THEN
    BEGIN
      v_send_back_reason := NULLIF(current_setting('app.current_send_back_reason', true), '');
    EXCEPTION WHEN OTHERS THEN
      v_send_back_reason := NULL;
    END;

    BEGIN
      INSERT INTO public.notifications (user_id, type, title, message, kpi_id, related_user_id, metadata)
      VALUES (v_employee_id, 'manager_rejected', 'KPI Sent Back for Revision',
        'Your KPI has been sent back for revision: ' || v_kpi_name,
        NEW.id, auth.uid(),
        jsonb_build_object(
          'kra_name', v_kra_name,
          'from_status', OLD.status,
          'to_status', NEW.status,
          'send_back_reason', v_send_back_reason
        ));
    EXCEPTION WHEN foreign_key_violation THEN NULL;
    END;
  END IF;

  IF OLD.status = 'kra_set' AND (NEW.status = 'self_review' OR NEW.status = 'manager_check') THEN
    IF v_manager_id IS NOT NULL THEN
      BEGIN
        INSERT INTO public.notifications (user_id, type, title, message, kpi_id, related_user_id, metadata)
        VALUES (v_manager_id, 'kpi_submitted', 'Self Review Submitted',
          v_employee_display || ' submitted self-review for KPI: ' || v_kpi_name,
          NEW.id, v_employee_id,
          jsonb_build_object('kra_name', v_kra_name, 'from_status', OLD.status, 'to_status', NEW.status, 'employee_name', v_employee_name, 'employee_code', v_employee_code));
      EXCEPTION WHEN foreign_key_violation THEN NULL;
      END;
    END IF;

  ELSIF OLD.status = 'self_review' AND NEW.status = 'manager_check' THEN
    BEGIN
      INSERT INTO public.notifications (user_id, type, title, message, kpi_id, related_user_id, metadata)
      VALUES (v_employee_id, 'kpi_approved', 'KPI Approved by Manager',
        'Your KPI has been approved by manager: ' || v_kpi_name,
        NEW.id, auth.uid(),
        jsonb_build_object('kra_name', v_kra_name, 'stage', 'manager'));
    EXCEPTION WHEN foreign_key_violation THEN NULL;
    END;

    -- Assignment-scoped auditor fan-out. An auditor may be assigned directly
    -- to this KPI or at employee level. UNION deduplicates dual assignments.
    BEGIN
      INSERT INTO public.notifications (user_id, type, title, message, kpi_id, related_user_id, metadata)
      SELECT recipients.auditor_id, 'kpi_ready_for_audit', 'KPI Ready for Audit',
        v_employee_display || ' has a KPI ready for audit: ' || v_kpi_name,
        NEW.id, v_employee_id,
        jsonb_build_object('kra_name', v_kra_name, 'stage', 'audit', 'employee_name', v_employee_name, 'employee_code', v_employee_code)
      FROM (
        SELECT la.auditor_id
        FROM public.audit_kpi_level_assignments la
        WHERE la.kpi_id = NEW.id
        UNION
        SELECT a.auditor_id
        FROM public.audit_kpi_assignments a
        WHERE a.employee_id = v_employee_id
      ) AS recipients
      JOIN public.profiles auditor_profile
        ON auditor_profile.id = recipients.auditor_id
       AND auditor_profile.is_active = true
      WHERE EXISTS (
        SELECT 1 FROM auth.users au WHERE au.id = recipients.auditor_id
      );
    EXCEPTION WHEN foreign_key_violation THEN NULL;
    END;

  ELSIF NEW.status = 'approved' THEN
    SELECT final_score INTO v_final_score
    FROM public.review_submissions
    WHERE kpi_id = NEW.id
    ORDER BY updated_at DESC NULLS LAST
    LIMIT 1;

    v_final_score_text := CASE WHEN v_final_score IS NULL THEN 'N/A' ELSE v_final_score::text END;

    BEGIN
      INSERT INTO public.notifications (user_id, type, title, message, kpi_id, related_user_id, metadata)
      VALUES (v_employee_id, 'kpi_finalized', 'KPI Finalized',
        'Your KPI has been finalized: ' || v_kpi_name || ' (Score: ' || v_final_score_text || ')',
        NEW.id, auth.uid(),
        jsonb_build_object('kra_name', v_kra_name, 'final_score', v_final_score));
    EXCEPTION WHEN foreign_key_violation THEN NULL;
    END;
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.notify_on_kpi_status_change() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.notify_on_kpi_status_change() TO authenticated, service_role;

COMMENT ON FUNCTION public.notify_on_kpi_status_change() IS
  'Dispatches KPI workflow notifications. Audit-ready notifications are restricted to active, login-enabled auditors assigned to the KPI or employee; notification delivery remains best-effort. See POLICY §108 and §108f, ADR-132.';
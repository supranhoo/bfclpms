
DROP VIEW IF EXISTS public.safety_incidents_with_sla;
CREATE VIEW public.safety_incidents_with_sla
WITH (security_invoker = true) AS
SELECT id,
  incident_number,
  client_submission_id,
  reporter_id,
  business_unit_id,
  department_id,
  incident_type,
  severity,
  status,
  title,
  description,
  location,
  occurred_at,
  involved_person_id,
  involved_person_name,
  assigned_to,
  assigned_at,
  acknowledge_due_at,
  close_due_at,
  closed_at,
  closed_by,
  rca_summary,
  capa_summary,
  verification_notes,
  created_at,
  updated_at,
  CASE
    WHEN status = 'closed'::safety_incident_status THEN 'closed'::text
    WHEN sla_due_at IS NOT NULL AND now() > sla_due_at THEN 'red'::text
    WHEN sla_due_at IS NOT NULL AND now() > (sla_start_at + (sla_due_at - sla_start_at) * (COALESCE(sla_amber_threshold_pct, 50)::numeric / 100::numeric)::double precision) THEN 'amber'::text
    WHEN sla_due_at IS NULL AND now() > close_due_at THEN 'red'::text
    WHEN sla_due_at IS NULL AND now() > (close_due_at - (close_due_at - created_at) * 0.25::double precision) THEN 'amber'::text
    ELSE 'green'::text
  END AS sla_state,
  routed_bu_head_id,
  routed_manager_id,
  routed_second_manager_id,
  routing_status,
  safety_head_id,
  verifier_id,
  priority,
  sla_rule_id,
  sla_start_at,
  sla_due_at,
  sla_target_hours,
  sla_amber_threshold_pct,
  CASE
    WHEN status = 'closed'::safety_incident_status AND closed_at IS NOT NULL AND sla_due_at IS NOT NULL AND closed_at <= sla_due_at THEN 'closed_on_time'::text
    WHEN status = 'closed'::safety_incident_status AND closed_at IS NOT NULL AND sla_due_at IS NOT NULL AND closed_at > sla_due_at THEN 'closed_late'::text
    WHEN status = 'closed'::safety_incident_status THEN 'closed_on_time'::text
    WHEN sla_due_at IS NOT NULL AND now() > sla_due_at THEN 'overdue'::text
    WHEN sla_due_at IS NOT NULL AND now() > (sla_start_at + (sla_due_at - sla_start_at) * (COALESCE(sla_amber_threshold_pct, 50)::numeric / 100::numeric)::double precision) THEN 'at_risk'::text
    ELSE 'on_track'::text
  END AS sla_status,
  incident_type_id,
  severity_id,
  type_label_snapshot,
  severity_label_snapshot
FROM public.safety_incidents i;

GRANT SELECT ON public.safety_incidents_with_sla TO authenticated;

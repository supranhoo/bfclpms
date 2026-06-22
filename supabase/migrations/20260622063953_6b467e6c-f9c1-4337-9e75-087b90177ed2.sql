REVOKE SELECT ON public.mv_safety_audit_scoreboard          FROM anon, authenticated;
REVOKE SELECT ON public.mv_safety_dept_risk_trend           FROM anon, authenticated;
REVOKE SELECT ON public.mv_safety_incident_monthly_trend    FROM anon, authenticated;
REVOKE SELECT ON public.mv_safety_incidents_open_vs_closed  FROM anon, authenticated;
REVOKE SELECT ON public.mv_safety_permit_throughput         FROM anon, authenticated;
REVOKE SELECT ON public.mv_safety_recurrence                FROM anon, authenticated;
REVOKE SELECT ON public.mv_safety_severity_rate             FROM anon, authenticated;
REVOKE SELECT ON public.mv_safety_top_root_causes           FROM anon, authenticated;
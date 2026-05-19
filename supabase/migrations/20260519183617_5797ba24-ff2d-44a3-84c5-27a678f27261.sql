-- T-001: Revoke public reads on safety materialized views.
-- MVs cannot carry RLS; restrict to service_role only. The
-- safety-analytics edge function will read these with a service-role
-- client gated by has_any_safety_role(auth.uid()).

revoke select on
  public.mv_safety_trir,
  public.mv_safety_severity_rate,
  public.mv_safety_incidents_open_vs_closed,
  public.mv_safety_training_compliance,
  public.mv_safety_audit_scoreboard,
  public.mv_safety_permit_throughput
from anon, authenticated;

grant select on
  public.mv_safety_trir,
  public.mv_safety_severity_rate,
  public.mv_safety_incidents_open_vs_closed,
  public.mv_safety_training_compliance,
  public.mv_safety_audit_scoreboard,
  public.mv_safety_permit_throughput
to service_role;
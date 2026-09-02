-- ADR-342 — Org KPI propagation: remove the stale resolver overload.
--
-- ADR-322 introduced resolve_org_kpi_target_kpis(..., p_target_id uuid) with
-- CREATE OR REPLACE. A new argument list creates a NEW function, so the older
-- 8-argument version stayed live. Both carry defaults, so the client's
-- 8-named-argument call matched both candidates and PostgREST failed with
-- "could not choose the best candidate function" — propagation was blocked for
-- every organisational KPI. The 9-argument version is a strict superset
-- (p_target_id defaults to NULL = the old behaviour), so the old one is dropped.
DROP FUNCTION IF EXISTS public.resolve_org_kpi_target_kpis(
  uuid, text, text, text, integer, text, uuid, uuid
);

GRANT EXECUTE ON FUNCTION public.resolve_org_kpi_target_kpis(
  uuid, text, text, text, integer, text, uuid, uuid, uuid
) TO authenticated;
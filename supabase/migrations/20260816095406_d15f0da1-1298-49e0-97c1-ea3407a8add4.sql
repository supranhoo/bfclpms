-- ADR-285 (follow-up) — bu_console_apply_kpi_changes is an internal, ungated
-- SECURITY DEFINER writer. It must never be reachable straight from the API;
-- only the gated console RPCs (which run as owner) may call it.
REVOKE EXECUTE ON FUNCTION public.bu_console_apply_kpi_changes(uuid, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.bu_console_apply_kpi_changes(uuid, jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.bu_console_apply_kpi_changes(uuid, jsonb) FROM authenticated;

COMMENT ON FUNCTION public.bu_console_apply_kpi_changes(uuid, jsonb) IS
  'ADR-285 - INTERNAL ONLY. No permission check of its own; callers must gate via bu_console_can_write + bu_console_kpi_actionable. EXECUTE revoked from anon/authenticated.';
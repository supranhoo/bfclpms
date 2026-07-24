
-- ADR-148 (rollout): bulk backfill of the management terminal stage across
-- every user carrying the 'management' app role. Thin wrapper over the
-- existing per-user RPC — same audit/archive plumbing, aggregated results.

CREATE OR REPLACE FUNCTION public.backfill_management_stage_all(
  p_reopen_completed boolean DEFAULT false,
  p_dry_run boolean DEFAULT true,
  p_reason text DEFAULT 'ADR-148 bulk rollout'
)
RETURNS TABLE (
  management_uid uuid,
  management_name text,
  rows_stamped int,
  rows_reopened int,
  snapshots_written int
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_is_admin boolean;
  r record;
  v_res jsonb;
BEGIN
  SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id = v_actor AND role = 'admin')
    INTO v_is_admin;
  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'not authorized: admin role required for bulk management backfill';
  END IF;

  FOR r IN
    SELECT DISTINCT ur.user_id, p.full_name
    FROM public.user_roles ur
    LEFT JOIN public.profiles p ON p.id = ur.user_id
    WHERE ur.role = 'management'
    ORDER BY p.full_name NULLS LAST
  LOOP
    v_res := public.backfill_management_stage_for_manager(
      r.user_id, p_reopen_completed, p_dry_run, p_reason
    );

    management_uid    := r.user_id;
    management_name   := r.full_name;
    rows_stamped      := COALESCE((v_res->>'rows_stamped')::int, 0);
    rows_reopened     := COALESCE((v_res->>'rows_reopened')::int, 0);
    snapshots_written := COALESCE((v_res->>'snapshots_written')::int, 0);
    RETURN NEXT;
  END LOOP;

  RETURN;
END;
$$;

REVOKE ALL ON FUNCTION public.backfill_management_stage_all(boolean, boolean, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.backfill_management_stage_all(boolean, boolean, text) TO authenticated, service_role;

COMMENT ON FUNCTION public.backfill_management_stage_all(boolean, boolean, text)
IS 'ADR-148 rollout — Iterates every user with role=management and calls backfill_management_stage_for_manager. Admin-only. Returns per-manager counters.';

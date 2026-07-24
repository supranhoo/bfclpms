
-- ADR-158: Management stage scope = employees who directly report to a Management-role user.

CREATE TABLE IF NOT EXISTS public.annual_review_mgmt_scope_backfill_2026_07 (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id UUID NOT NULL,
  employee_id UUID NOT NULL,
  prev_enabled_stages JSONB NOT NULL,
  prev_management_id UUID,
  prev_overall_status TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.annual_review_mgmt_scope_backfill_2026_07 TO authenticated;
GRANT ALL ON public.annual_review_mgmt_scope_backfill_2026_07 TO service_role;
ALTER TABLE public.annual_review_mgmt_scope_backfill_2026_07 ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admins read mgmt scope backfill" ON public.annual_review_mgmt_scope_backfill_2026_07;
CREATE POLICY "admins read mgmt scope backfill"
  ON public.annual_review_mgmt_scope_backfill_2026_07 FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

DO $$
DECLARE v_locked_mgmt INT;
BEGIN
  SELECT count(*) INTO v_locked_mgmt
  FROM public.annual_review_responses r
  JOIN public.annual_review_instances i ON i.id = r.instance_id
  JOIN public.profiles p ON p.id = i.employee_id
  WHERE i.enabled_stages ? 'management'
    AND r.reviewer_role = 'management'
    AND r.is_locked = true
    AND NOT EXISTS (
      SELECT 1 FROM public.user_roles ur
      JOIN public.profiles pm ON pm.id = ur.user_id
      WHERE ur.user_id = p.reporting_manager_id
        AND ur.role = 'management' AND pm.is_active = true
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.annual_review_assignment_overrides o
      WHERE o.instance_id = i.id AND o.role = 'management'
    );
  IF v_locked_mgmt > 0 THEN
    RAISE EXCEPTION 'ADR-158 aborted: % locked Management responses would be orphaned', v_locked_mgmt;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.enforce_management_terminal_stage()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_stages          jsonb;
  v_reports_to      uuid;
  v_reports_to_mgmt boolean := false;
  v_override_mgmt   uuid;
  v_has_locked_mgmt boolean := false;
BEGIN
  v_stages := COALESCE(NEW.enabled_stages, '[]'::jsonb);

  SELECT o.new_reviewer_id INTO v_override_mgmt
    FROM public.annual_review_assignment_overrides o
   WHERE o.instance_id = NEW.id AND o.role = 'management'
   LIMIT 1;

  SELECT p.reporting_manager_id INTO v_reports_to
    FROM public.profiles p WHERE p.id = NEW.employee_id;

  IF v_reports_to IS NOT NULL AND v_reports_to <> NEW.employee_id THEN
    SELECT EXISTS (
      SELECT 1 FROM public.user_roles ur
        JOIN public.profiles pm ON pm.id = ur.user_id
       WHERE ur.user_id = v_reports_to
         AND ur.role = 'management'
         AND pm.is_active = true
    ) INTO v_reports_to_mgmt;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    SELECT EXISTS (
      SELECT 1 FROM public.annual_review_responses r
       WHERE r.instance_id = NEW.id
         AND r.reviewer_role = 'management'
         AND r.is_locked = true
    ) INTO v_has_locked_mgmt;
  END IF;

  IF v_reports_to_mgmt OR v_override_mgmt IS NOT NULL THEN
    SELECT COALESCE(jsonb_agg(elem), '[]'::jsonb) INTO v_stages
    FROM jsonb_array_elements(v_stages) elem
    WHERE elem NOT IN (
      to_jsonb('bu_head'::text),
      to_jsonb('dept_head'::text),
      to_jsonb('skip_manager'::text),
      to_jsonb('manager'::text)
    );
    NEW.bu_head_id   := NULL;
    NEW.dept_head_id := NULL;
    NEW.skip_id      := NULL;
    NEW.manager_id   := NULL;
    NEW.management_id := COALESCE(v_override_mgmt, v_reports_to);
    IF NOT (v_stages ? 'management') THEN
      v_stages := v_stages || jsonb_build_array('management');
    END IF;
    NEW.enabled_stages := v_stages;
    RETURN NEW;
  END IF;

  IF (v_stages ? 'management') AND NOT v_has_locked_mgmt THEN
    SELECT COALESCE(jsonb_agg(elem), '[]'::jsonb) INTO v_stages
    FROM jsonb_array_elements(v_stages) elem
    WHERE elem <> to_jsonb('management'::text);
    NEW.enabled_stages := v_stages;
    NEW.management_id  := NULL;
  END IF;

  RETURN NEW;
END;
$function$;

WITH targets AS (
  SELECT i.id, i.employee_id, i.enabled_stages, i.management_id, i.overall_status
  FROM public.annual_review_instances i
  JOIN public.profiles p ON p.id = i.employee_id
  WHERE i.enabled_stages ? 'management'
    AND NOT EXISTS (
      SELECT 1 FROM public.user_roles ur
      JOIN public.profiles pm ON pm.id = ur.user_id
      WHERE ur.user_id = p.reporting_manager_id
        AND ur.role = 'management' AND pm.is_active = true
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.annual_review_assignment_overrides o
      WHERE o.instance_id = i.id AND o.role = 'management'
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.annual_review_responses r
      WHERE r.instance_id = i.id AND r.reviewer_role = 'management' AND r.is_locked = true
    )
),
snap AS (
  INSERT INTO public.annual_review_mgmt_scope_backfill_2026_07
    (instance_id, employee_id, prev_enabled_stages, prev_management_id, prev_overall_status)
  SELECT id, employee_id, enabled_stages, management_id, overall_status FROM targets
  RETURNING instance_id, employee_id, prev_enabled_stages, prev_management_id, prev_overall_status
),
upd AS (
  UPDATE public.annual_review_instances i
  SET enabled_stages = (
        SELECT COALESCE(jsonb_agg(elem), '[]'::jsonb)
        FROM jsonb_array_elements(i.enabled_stages) elem
        WHERE elem <> to_jsonb('management'::text)
      ),
      management_id = NULL,
      updated_at = now()
  FROM snap
  WHERE i.id = snap.instance_id
  RETURNING i.id, i.employee_id, i.enabled_stages, i.management_id, snap.prev_enabled_stages, snap.prev_management_id
)
INSERT INTO public.annual_review_access_audit (action, actor_id, target_user_id, before, after, reason)
SELECT
  'management_stage.reverted',
  NULL,
  upd.employee_id,
  jsonb_build_object('enabled_stages', upd.prev_enabled_stages, 'management_id', upd.prev_management_id, 'instance_id', upd.id),
  jsonb_build_object('enabled_stages', upd.enabled_stages,      'management_id', upd.management_id,      'instance_id', upd.id),
  'ADR-158: employee does not report to a Management-role user; Management stage stripped'
FROM upd;

DO $$
DECLARE v_orphans INT; v_bad INT;
BEGIN
  SELECT count(*) INTO v_orphans
  FROM public.annual_review_instances
  WHERE overall_status = 'pending_management'
    AND NOT (enabled_stages ? 'management');
  IF v_orphans > 0 THEN
    RAISE EXCEPTION 'ADR-158 post-check failed: % instances stuck pending_management without stage', v_orphans;
  END IF;

  SELECT count(*) INTO v_bad
  FROM public.annual_review_instances i
  JOIN public.profiles p ON p.id = i.employee_id
  WHERE i.enabled_stages ? 'management'
    AND NOT EXISTS (
      SELECT 1 FROM public.user_roles ur
      JOIN public.profiles pm ON pm.id = ur.user_id
      WHERE ur.user_id = p.reporting_manager_id
        AND ur.role = 'management' AND pm.is_active = true
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.annual_review_assignment_overrides o
      WHERE o.instance_id = i.id AND o.role = 'management'
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.annual_review_responses r
      WHERE r.instance_id = i.id AND r.reviewer_role = 'management' AND r.is_locked = true
    );
  IF v_bad > 0 THEN
    RAISE EXCEPTION 'ADR-158 post-check failed: % instances still carry Management stage improperly', v_bad;
  END IF;
END $$;

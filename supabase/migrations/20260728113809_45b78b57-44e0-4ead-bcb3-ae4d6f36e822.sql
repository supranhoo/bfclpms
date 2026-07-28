-- ADR-192 / POLICY §SAFETY-PII-SCOPE
-- Scope safety-role access to employee PII. Elevated safety roles keep org-wide
-- visibility; all other safety roles are scoped to their own org unit or to
-- employees attached to a safety matter they are responsible for.

CREATE OR REPLACE FUNCTION public.has_elevated_safety_role(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.has_safety_role(_user_id, 'admin'::safety_app_role)
    OR public.has_safety_role(_user_id, 'safety_head'::safety_app_role)
    OR public.has_safety_role(_user_id, 'safety_officer'::safety_app_role)
    OR public.resolve_global_safety_head() = _user_id;
$$;

REVOKE EXECUTE ON FUNCTION public.has_elevated_safety_role(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_elevated_safety_role(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.can_view_profile_for_safety(_viewer_id uuid, _target_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    _viewer_id IS NOT NULL
    AND (
      -- Self
      _viewer_id = _target_id

      -- Elevated safety roles keep organisation-wide visibility
      OR public.has_elevated_safety_role(_viewer_id)

      -- Only users who actually hold some safety responsibility get further access
      OR (
        public.has_responsible_safety_role(_viewer_id)
        AND (
          -- Direct or functional reporting line
          EXISTS (
            SELECT 1 FROM public.profiles t
            WHERE t.id = _target_id
              AND (t.reporting_manager_id = _viewer_id
                OR t.functional_manager_id = _viewer_id)
          )

          -- Same department
          OR EXISTS (
            SELECT 1
            FROM public.profiles v
            JOIN public.profiles t ON t.department_id = v.department_id
            WHERE v.id = _viewer_id
              AND t.id = _target_id
              AND v.department_id IS NOT NULL
          )

          -- Department head of the target's department
          OR EXISTS (
            SELECT 1
            FROM public.profiles t
            JOIN public.departments d ON d.id = t.department_id
            WHERE t.id = _target_id
              AND d.head_user_id = _viewer_id
          )

          -- Business unit the viewer heads (via departments -> business_units)
          OR EXISTS (
            SELECT 1
            FROM public.profiles t
            JOIN public.departments d ON d.id = t.department_id
            JOIN public.business_units bu ON bu.id = d.business_unit_id
            WHERE t.id = _target_id
              AND bu.head_user_id = _viewer_id
          )

          -- Business unit the viewer is routed for on active routing rules
          OR EXISTS (
            SELECT 1
            FROM public.profiles t
            JOIN public.departments d ON d.id = t.department_id
            JOIN public.safety_incident_routing_rules rr
              ON rr.business_unit_id = d.business_unit_id
            WHERE t.id = _target_id
              AND rr.is_active = true
              AND (rr.bu_head_id = _viewer_id
                OR rr.manager_id = _viewer_id
                OR rr.second_manager_id = _viewer_id)
          )

          -- Target is attached to a safety incident the viewer is responsible for
          OR EXISTS (
            SELECT 1
            FROM public.safety_incidents i
            WHERE (i.reporter_id = _target_id
                OR i.actual_reporter_id = _target_id
                OR i.involved_person_id = _target_id
                OR i.assigned_to = _target_id
                OR i.verifier_id = _target_id)
              AND (i.assigned_to = _viewer_id
                OR i.routed_bu_head_id = _viewer_id
                OR i.routed_manager_id = _viewer_id
                OR i.routed_second_manager_id = _viewer_id
                OR i.safety_head_id = _viewer_id
                OR i.verifier_id = _viewer_id
                OR i.reporter_id = _viewer_id
                OR i.actual_reporter_id = _viewer_id)
          )
        )
      )
    );
$$;

REVOKE EXECUTE ON FUNCTION public.can_view_profile_for_safety(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_view_profile_for_safety(uuid, uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS "Safety responsible roles can view active profiles" ON public.profiles;

CREATE POLICY "Safety roles can view scoped active profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  is_active = true
  AND public.can_view_profile_for_safety(auth.uid(), id)
);

COMMENT ON POLICY "Safety roles can view scoped active profiles" ON public.profiles IS
  'ADR-192 / POLICY §SAFETY-PII-SCOPE: elevated safety roles (admin, safety head, safety officer, global safety head) keep org-wide visibility; all other safety roles are scoped to their own department/BU, reporting line, or incident relationship.';
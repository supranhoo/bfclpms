-- Phase 16 — Open safety incident reporting to all authenticated users.
-- Rationale: EHS standard practice — anyone can report a hazard.
-- SELECT/UPDATE/DELETE policies remain unchanged (still scoped to module access / role).
DROP POLICY IF EXISTS "Safety users can report incidents" ON public.safety_incidents;

CREATE POLICY "Authenticated users can report incidents"
  ON public.safety_incidents
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL AND reporter_id = auth.uid());

COMMENT ON POLICY "Authenticated users can report incidents" ON public.safety_incidents IS
  'Any authenticated user may file a safety incident as themselves. Downstream visibility (SELECT) and stage transitions (UPDATE) remain gated by has_safety_module_access / safety roles.';
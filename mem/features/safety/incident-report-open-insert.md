---
name: Safety Incident Open INSERT Policy
description: safety_incidents INSERT is open to all authenticated users (Phase 16, EHS standard). reporter_id = auth.uid() pin must remain; SELECT/UPDATE/DELETE gates unchanged.
type: feature
---
- Policy: `Authenticated users can report incidents` on `public.safety_incidents` — `FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL AND reporter_id = auth.uid())`.
- Reason: EHS standard — every employee can raise a hazard. The prior `has_safety_module_access(...)` gate blocked HR / non-safety users on the mobile incident form.
- Anti-impersonation: `reporter_id = auth.uid()` MUST remain in WITH CHECK. Never widen to allow arbitrary reporter_id.
- SELECT (`can_view_safety_incident`), UPDATE (admin/safety_head/safety_officer/assigned_to), DELETE (admin only), and `transition_safety_incident` RPC for stage moves are UNCHANGED.
- Idempotency via `client_submission_id` UNIQUE + `safety_incident_before_insert` trigger preserved — offline queue + `submitSafetyIncident` pipeline untouched.
- Regression lock: `src/test/safety/incidentReportRlsPolicy.test.ts`. RLS matrix entry: §F-RLS-03 in `docs/safety/phase1/rls-matrix.md`. POLICY §Phase16-Safety.
- Rollback: single migration re-creates `Safety users can report incidents` (legacy WITH CHECK) and drops the new policy. No data migration.
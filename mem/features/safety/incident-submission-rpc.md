---
name: Safety Incident Submission RPC (Phase 18)
description: Server-authoritative SECURITY DEFINER RPC `public.report_safety_incident(p_payload jsonb)` is the only path for creating safety incidents from the app. Stamps reporter_id from auth.uid(), idempotent on (reporter_id, client_submission_id).
type: feature
---
- Entrypoint: `supabase.rpc('report_safety_incident', { p_payload })` — used by both `src/lib/safetyIncidentSubmit.ts` (online + offline flush) and `useReportSafetyIncident()` in `src/hooks/useSafetyIncidents.ts`.
- NEVER call `.from('safety_incidents').insert(...)` from the browser for new incidents. The restrictive INSERT policy `Authenticated users can report incidents` is retained as defence-in-depth and will gate direct inserts.
- Server contract: `auth.uid()` NULL → raises `not_authenticated` (42501). Missing `client_submission_id` → 22023. Existing `(reporter_id, client_submission_id)` row → returns `{ id, incident_number, reused: true }` without inserting.
- `reporter_id` from the payload is IGNORED; the RPC stamps `auth.uid()` server-side. Anti-impersonation is enforced at the API boundary, not just the policy boundary.
- BEFORE INSERT trigger (`safety_incident_before_insert`) still owns incident numbering and SLA deadline stamping — do not duplicate that logic in the RPC.
- Grants: `EXECUTE` to `authenticated`; REVOKE from `anon` and `PUBLIC`.
- Evidence upload pipeline (`safety-media` bucket + `safety_incident_evidence` rows) is unchanged and uses the `id` returned by the RPC.
- Rollback: drop the RPC + revert the two frontend files to the prior direct-insert form. No data migration.
- Regression lock: `src/test/safety/incidentReportRlsPolicy.test.ts` (Phase 18 block — SECURITY DEFINER, pinned search_path, server-stamped reporter_id, unauthenticated rejection, idempotency, grant/revoke posture).
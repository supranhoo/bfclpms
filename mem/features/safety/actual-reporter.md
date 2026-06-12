---
name: Safety Actual Reporter (file-on-behalf-of)
description: Optional secondary reporter (actual_reporter_id) on safety_incidents — display/audit only, set via report RPC, never grants access
type: feature
---
Phase 1 of June 2026 enhancements.

- Column: `public.safety_incidents.actual_reporter_id uuid REFERENCES profiles(id)` — nullable, indexed.
- The logged-in user remains the authoritative `reporter_id` (stamped by `report_safety_incident` from `auth.uid()`); `actual_reporter_id` is the person on whose behalf the incident was filed.
- The RPC validates `actual_reporter_id` exists in `profiles` and rejects with `actual_reporter_not_found` (22023) if not.
- It does NOT grant the actual reporter any access, notifications, or routing — purely display/audit metadata.
- UI:
  - `SafetyIncidentNew` — searchable employee picker, strict (no free text), clearable.
  - `SafetyIncidents` list — "Reported" column renders an "On behalf of" sub-block when set; uses the single batched profiles IN() that already hydrates the primary reporter (merged id set, one round trip).
  - `SafetyIncidentDetail` — header gains a two-column block: "Reported by" (always) and "On behalf of" (when present).
- Exports: `safetyDataExport.ts` incidents dataset includes `actual_reporter_id`.
- Regression lock: `src/test/safety/incidentActualReporter.test.ts`.
- No new role; no RLS change; no workflow change; backup auto-covered (additive column).
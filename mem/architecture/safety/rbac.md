---
name: Safety RBAC
description: Safety module uses safety_app_role enum + safety_user_roles table + has_safety_role() SECURITY DEFINER. Separate from PMS roles. Granting any safety role implicitly grants Hub access via has_safety_module_access.
type: feature
---
- Roles: admin, safety_head, safety_officer, bu_head, manager, supervisor, worker, auditor (SSOT: src/lib/safetyRoles.ts).
- Table: public.safety_user_roles (user_id, role, business_unit_id, department_id, assigned_by, assigned_at). Unique across the four-tuple, NULL-safe via COALESCE index.
- Check helper: has_safety_role(uid, role, bu?) — SECURITY DEFINER, used in every Safety RLS policy to avoid recursion. Mirrors PMS has_role.
- Convenience: has_any_safety_role(uid) for shell guards.
- Audit: every grant/revoke logged to public.safety_audit_log via trigger; only admin role can read.
- Module access (Phase 19, org-wide rollout): has_safety_module_access(uid) returns true for EVERY authenticated user. Safety Hub card and /safety/* routes are universally visible so any employee can raise an incident. Role-based actions inside Safety (closure approvals, RBAC mgmt, audit log, SLA monitor, etc.) remain gated by has_safety_role() and per-table RLS. The safety_module_access table is retained for backwards compatibility but is no longer the visibility gate.
- UI: /safety/settings/users (SafetyUsers page) — admins grant/revoke; everyone sees their own assignments.
- Phase 19.1 profiles read policy: `Safety admins can view active profiles for role grants` on `public.profiles` — SELECT-only, `TO authenticated`, `USING (is_active = true AND has_safety_role(auth.uid(), 'admin'))`. Without this, a Safety admin who is NOT also a PMS admin sees an empty user list on /safety/settings/users (the previously-reported "search not working" bug). Lock: `src/test/safety/safetyAdminProfilesRead.test.ts`.
- Phase 19.1 SafetyUsers UX: user picker is a Popover + cmdk Command combobox (closes on select / outside click / Escape). Search is deferred — typing only updates `draftSearch`; the network query fires only when the popover is open AND the user clicks Search / presses Enter. Mirrors the SafetyFilterBar/SafetyFilterSheet deferred-search rule used across all other Safety lists.

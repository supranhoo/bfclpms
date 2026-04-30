---
name: Identity & Access Console (IAC)
description: Hub-level capability-based RBAC replacing per-module role enums; lives at /admin/iac
type: feature
---
# Identity & Access Console (IAC)

Single Hub-level surface at `/admin/iac` for managing identity & access across all modules (PMS, Safety, future HRMS/LMS).

**Model (Phase 1 — additive only):**
- `iac_capabilities` — fine-grained action catalog. Immutable, dev-managed via migrations.
- `iac_roles` — admin-editable bundles per module. System roles flagged.
- `iac_role_capabilities` — mapping table.
- `iac_user_role_assignments` — user × role × scope (`global | company | business_unit | department`), with optional `expires_at`.
- `iac_audit_log` — immutable; only writable via `iac_log()` SECURITY DEFINER.
- `has_capability(uid, cap, scope_type, scope_id)` — authoritative SQL gate.

**Service layer:** `src/services/iac/iacService.ts` is the SSOT for IAC Supabase access. UI uses `src/hooks/useIac.ts` React Query bindings.

**Console tabs:** People (directory + drawer), Roles (capability checklist), Capabilities (read-only catalog), Bulk (CSV import, idempotent), Audit.

**Coexistence:** Legacy `/admin/users` and `/safety/settings/users` keep working — both now show a banner linking to `/admin/iac`. RLS still uses `has_role()` / `has_safety_*` in Phase 1; backfill keeps `iac_user_role_assignments` in sync at migration time.

**Phase 2 (planned):** Migrate RLS to `has_capability`; access templates for Joiner-Mover-Leaver; destructive-capability approvals; cron-driven `expires_at` revocation.

**Constraint:** Capability codes are immutable once shipped (other code grants depend on them). To rename, deprecate + add new.
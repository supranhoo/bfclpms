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

**Phase 2 (shipped 2026-04-30):**
- `has_role()` / `has_safety_role()` / `has_any_safety_role()` are now OR-shims: legacy table OR `iac_user_role_assignments`. Grants made in the new console immediately gate every existing RLS policy. Strictly additive.
- Leaver automation: `iac_revoke_on_deactivation` trigger on `profiles.is_active` deletes all IAC assignments and audits with `actor_id = NULL` on the false transition.
- Expiry sweep: `iac_sweep_expired()` RPC + `iac-sweep-expired` edge function (CRON_SECRET-gated, `verify_jwt = false`). Schedule daily at 02:00.
- Bulk tab is now full round-trip: **Download Assignments CSV** (paginated 1000-row export joined with email + role code) and **Download Template CSV**; **Upload** supports file picker + paste; live preview categorises rows into Ready / Already exists / Unknown email / Unknown role / Invalid; per-row error report CSV is produced after Apply. CSV utilities live in `src/lib/iac/csv.ts`. Every failure path raises a destructive toast and logs `[IAC.bulk]` — no silent catches.

**Phase 3 (planned):** Access templates for Joiner-Mover; destructive-capability approval workflow; collapse legacy `user_roles` / `safety_user_roles` once IAC has been authoritative for one release.

**Constraint:** Capability codes are immutable once shipped (other code grants depend on them). To rename, deprecate + add new.
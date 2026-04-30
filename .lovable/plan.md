
# Long-term Identity & Access Architecture

## Problem
User & Role Management is split across PMS (`/admin/users`, 1.5k LOC) and Safety (`/safety/settings/users`), each with its own enum (`app_role`, `safety_app_role`) and ad-hoc grant table. Adding HRMS/LMS would multiply enums, screens, RLS variants, and audit gaps. Admins have no single place to see "who can do what" across the Hub.

## Target Architecture: Hub-level Identity & Access Console (IAC)

One console at **`/hub/admin/iac`** owns the full identity lifecycle. Modules stop owning user CRUD; they only declare their capabilities into a central catalog. Permissions become composable bundles ("Roles") of capabilities — never hardcoded enums.

```text
                       ┌─────────────────────────────┐
                       │   Hub: Identity & Access    │
                       │   (single console, tabs)    │
                       └──────────────┬──────────────┘
                                      │
        ┌─────────────────────────────┼─────────────────────────────┐
        ▼                             ▼                             ▼
   People (profiles)         Roles (bundles of caps)        Capability Catalog
   - identity                - per-module                   - declared by each
   - employment              - cloneable                      module at build
   - status                  - org-scoped                   - immutable codes
        │                             │                             │
        └──────────────┬──────────────┘                             │
                       ▼                                            │
              user_role_assignments  ◀───────────────────────────────┘
              (user × role × scope)            role_capabilities
                       │
                       ▼
              has_capability(uid, 'safety.incident.create', scope) ──► RLS / UI guards
```

### Core principles
1. **Capabilities, not enums.** Every gated action gets a stable code like `safety.incident.create`, `pms.review.approve`, `hub.iac.manage`. Modules register their own; the catalog is the SSOT.
2. **Roles are data, not code.** A role is a row + a set of capability rows. Admins can create/clone/edit roles without a deploy. Seed roles (Safety Admin, Manager, Worker, PMS Admin, etc.) are migrations but editable.
3. **Scope is first-class.** Every assignment carries an optional scope (module, business_unit, department, company). One uniform `has_capability(user, cap, scope)` SQL function powers all RLS.
4. **Module access derives from capabilities.** No more `safety_module_access` table — if a user holds any capability tagged to module `safety`, they see the Hub card. PMS admins get all modules via a `*` capability.
5. **Single console, tabbed.** Hub admins see all tabs. Module admins (e.g. Safety Admin) see only the tabs their capability allows.

## Phase 1 — Console + Catalog (ships first)

### DB (migration)
- `capabilities (code PK, module, label, description, is_destructive)` — seeded with current PMS + Safety actions.
- `roles (id, code, name, module, description, is_system, is_active)` — seeded with today's enum values for parity.
- `role_capabilities (role_id, capability_code)`.
- `user_role_assignments (id, user_id, role_id, scope_type, scope_id, assigned_by, assigned_at, expires_at)` — replaces `user_roles` and `safety_user_roles` over time. Scope_type ∈ `global | company | business_unit | department`.
- SQL: `has_capability(_uid, _cap, _scope_type, _scope_id) returns bool` SECURITY DEFINER. Used everywhere `has_role(...)` is used today.
- Compatibility shims: keep `has_role()` and `safety` helpers as thin wrappers that resolve through the new tables, so existing 100+ RLS policies don't move in v1.

### UI — `/hub/admin/iac`
Tabs (visibility filtered by capability):
1. **People** — searchable directory; click → drawer with Identity, Employment, Module Access, Roles, Audit Trail.
2. **Roles** — list per module, with capability checklist editor, "Clone role", "Compare roles" diff view.
3. **Capabilities** — read-only catalog (developer reference) with usage count.
4. **Bulk Operations** — CSV import/export of `user, module, role, scope`; bulk grant/revoke; preview-then-apply with a dry-run report.
5. **Audit** — every assign/revoke/role-edit logged immutably; filter by user, actor, module, date.

Bulk + audit are **mandatory in v1** per your direction.

### Migration & coexistence
- Old `/admin/users` and `/safety/settings/users` continue working — both become thin wrappers that deep-link into the new console with the relevant tab/filter pre-selected.
- A one-time migration backfills `user_role_assignments` from `user_roles` + `safety_user_roles`. Old tables remain readable for one release, then dropped.

## Phase 2 — Lifecycle Automation (after Phase 1 stable)

- **Joiner-Mover-Leaver:** `access_templates` (e.g. "New Plant Supervisor") map a job role / department to a default capability bundle. On profile creation, an edge function applies the template.
- **Mover:** when `profiles.department_id` or `designation` changes, the engine diffs current vs target capabilities and surfaces a one-click "apply changes" to the admin (or auto-applies for whitelisted templates).
- **Leaver:** `is_active = false` triggers a SECURITY DEFINER function that revokes all assignments and writes an audit row attributed to `system`.
- **Approval workflow:** capabilities flagged `is_destructive` (e.g. `pms.score.override`) require an approver before activation. Reuses the existing rollback-request pattern.
- **Scheduled access:** `expires_at` on assignments + a daily cron that revokes and notifies — supports auditors, contractors, temporary acting roles.

## Risk & Impact Report

| Area | Impact | Mitigation |
|---|---|---|
| RLS | 100+ policies reference `has_role` / `has_safety_*` | Phase 1 keeps these as wrappers over the new model. No policy rewrites required to ship. |
| Data | `user_roles`, `safety_user_roles`, `safety_module_access` migrated | Idempotent backfill migration + parallel-run period; old tables read-only for one release before drop. |
| UX | Two existing screens become wrappers | Wrappers deep-link into the new console preserving muscle memory. Old URLs keep working. |
| Regression | Sidebar guards, ProtectedRoute, hub gating | Tests for `has_capability` parity vs `has_role` for every existing role × screen pair. |
| Future modules | New module just inserts capabilities + seed roles, gets full IAC for free | Catalog is the contract; PRs adding capabilities are reviewable in one place. |
| Multi-tenant | `scope_type=company` already in design | Multi-company governance memory honored; `corporate_id` tracked through scope. |

## Deliverables (Phase 1)

**Code**
- Migration: catalog, roles, assignments, `has_capability`, wrappers, backfill.
- Hub route `/hub/admin/iac` with 5 tabs + drawer.
- Shared service layer `src/services/iac/*` (no UI calls Supabase directly).
- Wrapper redirects on `/admin/users` and `/safety/settings/users`.

**Tests** (mandatory)
- Unit: `has_capability` matrix (role × cap × scope) with realistic mocks.
- Parity: every existing role passes the same gates as today.
- E2E happy + failure paths for grant, revoke, bulk import, audit write.

**Docs**
- `DOCUMENTATION.md` Identity & Access section + Version History bump.
- `POLICY.md` updated: capability codes are immutable, roles are admin-editable, destructive caps require approval (Phase 2).
- Memory note: `mem://architecture/security/identity-access-console`.

## Out of scope (call out so we don't drift)
- Replacing `access_profiles` / menu rights — they continue to govern *menu visibility*; capabilities govern *actions*. Phase 3 may merge them.
- SSO/SCIM provisioning — separate track.
- UI for editing the capability catalog — developer-managed via migration only.

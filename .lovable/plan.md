# Safety Module Configurable Access Control — Implementation Plan

## 1. Assumptions

- Reuse existing `safety_app_role` enum and `safety_user_roles` table (SSOT: `src/lib/safetyRoles.ts`). Do **not** introduce a parallel role system.
- Reuse existing `has_safety_role` / `has_safety_module_access` / `has_any_safety_role` SECURITY DEFINER helpers; add new resolver helpers alongside them, not replacements.
- Module-level visibility (`has_safety_module_access` = every authenticated user) remains untouched per Phase 19 memory. The new system only **narrows** what is shown/allowed inside `/safety/*`.
- "Admin" for the permission console = `has_safety_role(uid, 'admin')` only. Safety Head does **not** edit the matrix (can be added later via a config flag).
- Existing per-table RLS on `safety_*` tables (FSM guards, drill writes, RBAC) is the authoritative server gate and stays exactly as-is. The new permission layer is an **additive** UI + route + action gate; it never loosens RLS.
- Existing `menu_overrides` / `access_profiles` systems (PMS-wide) are **not** the right vehicle — Safety has its own role enum, BU/dept scope, and FSM. We keep this self-contained inside the Safety module to avoid coupling.
- "Phase 1–4" in the user request becomes our internal scope; we deliver all four in one cohesive change because the UI matrix is unusable without the action + widget keys seeded.

## 2. Risk & Impact Report

| Area | Risk | Mitigation |
| --- | --- | --- |
| Sidebar/routes | Hiding a nav item a user previously had → support tickets | Default policy = **allow** for every existing safety role on every permission key (open posture). Admins opt-in to restrict. |
| RLS | Adding a second gate could double-deny | New layer only short-circuits **before** RLS in the UI/route guard. Server RLS untouched. RPCs that already check `has_safety_role` keep working. |
| Widgets | Hiding a widget breaks dashboard layout | `BuHeadDashboard` and `SafetyHome` already render widgets in a `grid` with conditional blocks — null-return is safe. |
| Performance | Resolver called on every render | Single `useSafetyPermissions()` React Query (5 min stale), one row per user from a SQL function. |
| Rollback | Misconfigured rules locking out admin | DB function hard-codes `admin` role → always allowed for every key. Cannot be revoked from UI. |
| Backup | New tables must be covered | Tables live in `public` and are auto-included via `get_backup_table_order()` (per backup memory). No denylist entry. |

Scalability: 3 small tables, <500 rows expected. One JOIN per resolve. Negligible.

## 3. Database Schema (additive only)

### `safety_permission_keys` (catalog — seed-only)
| col | type |
|---|---|
| key | text PK (e.g. `nav.incidents`, `action.incidents.approve`, `widget.open_incidents`) |
| category | text — `nav` \| `action` \| `widget` |
| label | text |
| description | text |
| sort_order | int |
| is_active | bool default true |

### `safety_role_permissions` (RBAC matrix)
| col | type |
|---|---|
| role | `safety_app_role` |
| permission_key | text FK → safety_permission_keys |
| is_allowed | bool default true |
| updated_at, updated_by | audit |

PK = (role, permission_key).

### `safety_user_permission_overrides` (per-user grant/deny)
| col | type |
|---|---|
| user_id | uuid FK auth.users |
| permission_key | text FK |
| effect | text check (`allow`,`deny`) |
| reason | text |
| created_at, created_by | audit |

PK = (user_id, permission_key).

### Audit
Reuse existing `safety_audit_log` via trigger on the two writable tables.

### Resolver function
```sql
CREATE FUNCTION public.has_safety_permission(_user_id uuid, _key text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE v_override text; v_role_allow bool;
BEGIN
  -- 1. Admin always wins
  IF public.has_safety_role(_user_id, 'admin') THEN RETURN true; END IF;
  -- 2. User override
  SELECT effect INTO v_override FROM safety_user_permission_overrides
   WHERE user_id=_user_id AND permission_key=_key;
  IF v_override = 'deny' THEN RETURN false; END IF;
  IF v_override = 'allow' THEN RETURN true; END IF;
  -- 3. Any of the user's safety roles allows it?
  SELECT bool_or(COALESCE(rp.is_allowed, true)) INTO v_role_allow
    FROM safety_user_roles ur
    LEFT JOIN safety_role_permissions rp
      ON rp.role = ur.role AND rp.permission_key = _key
   WHERE ur.user_id = _user_id;
  -- 4. Default-allow if no rule exists (open posture, backwards compatible)
  RETURN COALESCE(v_role_allow, true);
END$$;
```

Companion bulk function `get_safety_permissions(_user_id)` returns `setof (key, allowed)` so the frontend resolves once per session.

### Permission keys seeded (40 total)

```
nav.home, nav.incidents, nav.permits, nav.assets, nav.audits, nav.emergency,
nav.training_my, nav.training_admin, nav.analytics, nav.hours_worked,
nav.permit_types, nav.sla_monitor, nav.users_roles, nav.audit_log

action.incidents.{view,create,edit,assign,investigate,approve,close,delete}
action.permits.{view,create,approve,reject,close}
action.assets.{view,create,edit,calibrate,archive}
action.audits.{view,create,execute,close}
action.training.{view,assign,complete,administer}
action.emergency.{view,trigger,resolve}
action.users.{view,create,edit,delete,manage_permissions}

widget.{open_incidents,overdue_incidents,at_risk,orphaned,closed,my_assignments,
        trend_30d,stage_dist,severity_dist,sla,compliance,training,audit,asset}
```

### RLS (all 3 new tables)
- `SELECT` to `authenticated` (matrix is non-sensitive; UI needs it to render).
- `INSERT/UPDATE/DELETE` only when `has_safety_role(auth.uid(),'admin')`.
- `service_role` full access.
- GRANTs per platform rule.

## 4. Permission Matrix (default seed)

Default seed = open for every existing role on every key, EXCEPT:

| Key prefix | worker | supervisor | manager | bu_head | safety_officer | safety_head | auditor |
|---|---|---|---|---|---|---|---|
| `nav.users_roles`, `nav.audit_log`, `nav.permit_types`, `nav.sla_monitor`, `nav.training_admin` | deny | deny | deny | deny | deny | allow | deny |
| `action.users.manage_permissions` | deny | deny | deny | deny | deny | allow | deny |
| `action.incidents.delete` | deny | deny | deny | deny | deny | allow | deny |
| `action.incidents.approve/close` | deny | deny | allow | allow | allow | allow | deny |
| `action.permits.approve/reject` | deny | deny | allow | allow | allow | allow | deny |
| `action.assets.archive` | deny | deny | deny | deny | allow | allow | deny |
| Everything else | allow | allow | allow | allow | allow | allow | allow (view-only widgets) |

`admin` skips the table entirely (always true via resolver short-circuit).

## 5. Files Affected

### Created (frontend)
- `src/lib/safety/permissionKeys.ts` — typed catalog constants (mirror of seed).
- `src/hooks/useSafetyPermissions.ts` — one query → `Set<string>`; exposes `can(key)`.
- `src/components/safety/PermissionGate.tsx` — `<PermissionGate keyName="action.incidents.delete">…</>`.
- `src/components/safety/SafetyRouteGuard.tsx` — wraps individual page routes (composes with existing `SafetyModuleRoute`).
- `src/components/safety/settings/PermissionMatrixPanel.tsx` — role × permission grid, search, bulk toggle.
- `src/components/safety/settings/UserOverridesPanel.tsx` — user picker (reuses `SafetyUsers` cmdk pattern) + per-key allow/deny.
- `src/components/safety/settings/PermissionAuditPanel.tsx` — reads `safety_audit_log` filtered to entity_type='safety_permissions'.

### Modified
- `src/components/safety/SafetySidebar.tsx` (or wherever nav lives — confirm at code time) — wrap each item in `PermissionGate`.
- `src/App.tsx` (Safety route block) — wrap each `/safety/*` route element in `SafetyRouteGuard keyName="nav.xxx"`.
- `src/pages/safety/SafetySettings.tsx` — add new "Security & Permissions" tab.
- `src/pages/safety/SafetyHome.tsx` + `src/components/safety/dashboard/BuHeadDashboard.tsx` — wrap each widget in `PermissionGate`.
- Action buttons (Approve/Reject/Delete/etc.) in `SafetyIncidentDetail.tsx`, `SafetyPermits.tsx`, `SafetyAssets.tsx`, `SafetyAudits.tsx`, training pages — wrap with `PermissionGate`.

### Created (DB)
One migration: tables + grants + RLS + resolver fn + bulk fn + seed of catalog + seed of restrictive defaults + audit trigger.

### Created (tests)
- `src/test/safety/permissions/resolver.test.ts` — admin short-circuit, override precedence, default-allow.
- `src/test/safety/permissions/matrix-seed.test.ts` — every catalog key has a label & category.

## 6. Implementation Steps

1. **Migration** (one call): catalog + matrix + overrides + RLS + GRANTs + `has_safety_permission` + `get_safety_permissions` + audit trigger + seed (40 keys + default deny rows).
2. **Frontend resolver hook + gate component + route guard.**
3. **Wire sidebar + routes.** Each nav item → `nav.xxx` key; each route → `SafetyRouteGuard`.
4. **Wire dashboard widgets** in `SafetyHome` and `BuHeadDashboard`.
5. **Wire action buttons** on incident/permit/asset/audit/training/emergency/users pages.
6. **Admin console** as a new tab inside `SafetySettings.tsx` (Matrix / Overrides / Audit subtabs).
7. **Tests + docs** (`DOCUMENTATION.md`, `POLICY.md`, audit doc, memory file `mem/features/safety/permission-system.md`).

## 7. UI Changes

- **Sidebar**: nav items missing a permission disappear (no greyed-out state — matches existing pattern).
- **Routes**: direct URL → `Navigate to /safety` with toast "You don't have permission to view this page".
- **Action buttons**: hidden when denied; server still enforces.
- **Dashboard**: widget tiles disappear; grid reflows automatically (already `grid auto-rows`).
- **New tab** in `/safety/settings` → "Security & Permissions" with 3 sub-tabs: Role Matrix · User Overrides · Audit Trail.
- Matrix: sticky-header table, rows = permission keys (grouped + searchable), cols = 8 roles, cells = checkbox.
- Bulk: "Select all in category" + "Allow/Deny selected for role X".

## 8. Open Question (one)

The default seed above restricts a handful of high-risk keys (users_roles, audit_log, delete) for non-admin/non-safety-head roles. Confirm this restrictive default is acceptable — alternative is **fully open** for every role on day-1 and let the admin restrict from the UI. I recommend the proposed restrictive seed; reply "fully open" to override.

## 9. Rollback Strategy

Single migration; revert = drop two writable tables + catalog + two functions. UI gates become no-ops because hook returns empty Set → fail-open path triggers (defaults to allow when no rule). No data loss in existing safety_* tables.

## 10. Not Applicable

Edge functions, storage buckets, third-party connectors.

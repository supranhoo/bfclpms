
## Root cause

- DB flag `system_settings.menu_overrides_enabled = false` is live in production.
- `menu_access_config` baseline admin/auditor rows are intact.
- The repo's `useResolvedMenu` + `AppSidebar.resolveGroupItems` already bypass the resolver when the flag is `false` (gated by `enabled` and queryKey includes the flag).
- The deployed bundle at `pms.bfclalloys.com` is an older JS build from before the CAPA patches. Frontend in Lovable does **not** auto-deploy — it must be republished. The DB flip alone cannot restore the sidebar if the live bundle still ignores or stale-caches the flag.

## Action (CAPA-only, no roadmap changes)

### Step 1 — Add a hard runtime guard so the flag is honored even with a stale cache

`useResolvedMenu` currently:
- caches the flag for 5 min (`staleTime`), and
- only gates via `enabled: !!enabled`.

Add a defensive layer so a brief cache window cannot leak the resolver tree into the sidebar:

1. In `useResolvedMenu`, when `enabled === false` explicitly return `undefined` data immediately (do not fall back to any previously cached payload from a sibling query key).
2. In `AppSidebar.resolveGroupItems`, short-circuit on `enabled === false` BEFORE touching `resolvedMenu`, so even a stale tree in memory cannot be consumed.
3. Reduce flag `staleTime` from `5 min` → `30 s` so flips propagate fast without a hard refresh.

No changes to `menu_registry`, `menu_overrides`, `applyOverrides`, the Menu Setting admin UI, or any RLS / PMS workflow.

### Step 2 — Verify baseline access is rendered from the static menu

`useMenuAccess.canAccess` already grants admin baseline (`admin-dashboard`, `admin-users`, `admin-settings`, `dashboard`, `inbox`, `reports-hub`) via `menu_access_config`. No DB changes required.

Auditor baseline (`audit-panel`, `admin-org-kpi-audit`, `dashboard`, `inbox`) is granted via the static menu's `roles` arrays plus role-based fallback in `canAccess`. No changes needed.

### Step 3 — Republish frontend

CAPA hardening only goes live after **Publish → Update**. This is the actual unblocker for both Ankit (admin) and Shekhar (auditor) on `pms.bfclalloys.com`.

### Step 4 — Verify

After publish:
- Hard refresh `pms.bfclalloys.com/dashboard` as admin → sidebar shows: My Dashboard, Inbox, KPI Registry, Admin Dashboard, User Management, System Settings, Reports, etc.
- Auditor → sidebar shows: My Dashboard, Inbox, Audit Panel, Org KPI Audit Review, Reports.
- Flip `menu_overrides_enabled` back to `true` in a staging window only after admins/auditors confirm stable navigation.

## Out of scope (explicitly)

- No edits to `menu_registry`, `menu_overrides`, `applyOverrides`, custom-tab routing.
- No RLS changes.
- No PMS workflow, scoring, reports, notifications, entitlements, permissions touched.
- No changes to `menu_access_config` data — current rows are correct.

## Technical detail

Files touched:
- `src/hooks/useResolvedMenu.ts` — return `undefined` when flag is false; staleTime `30s`.
- `src/components/layout/AppSidebar.tsx` — in `resolveGroupItems`, branch on `enabled === false` and return `fallback` before reading `resolvedMenu`.

No new files, no migrations, no edge function changes.

## Rollback

Revert the two files; the flag-based gate already in place continues to work.

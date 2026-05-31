## Goal
Introduce a new sidebar group **"KRA Settings"** and move the following entries out of **Administration** into it:

- KRA Library (`/admin/templates`)
- KRA Bundles (`/admin/bundles`)
- All KRAs (`/admin/kpis`)
- KRA Categories (`/admin/categories`)
- KPI Mapping (`/admin/kpi-mapping`)
- Weightage Matrix (`/admin/kpi-weightage`)
- KPI Standardization (`/admin/kpi-standardization`)

## Changes — `src/components/layout/AppSidebar.tsx`

1. **Add new menu group** in `getStaticMenuItems`:
   ```ts
   kraSettings: [
     { title: 'KRA Library',        icon: Library,        path: '/admin/templates',           menuKey: 'admin-templates',            roles: ['admin'] },
     { title: 'KRA Bundles',        icon: Package,        path: '/admin/bundles',             menuKey: 'admin-bundles',              roles: ['admin'] },
     { title: 'All KRAs',           icon: Target,         path: '/admin/kpis',                menuKey: 'admin-kpis',                 roles: ['admin'] },
     { title: 'KRA Categories',     icon: ClipboardList,  path: '/admin/categories',          menuKey: 'admin-categories',           roles: ['admin'] },
     { title: 'KPI Mapping',        icon: Target,         path: '/admin/kpi-mapping',         menuKey: 'admin-kpi-mapping',          roles: ['admin'] },
     { title: 'Weightage Matrix',   icon: Percent,        path: '/admin/kpi-weightage',       menuKey: 'admin-weightage',            roles: ['admin'] },
     { title: 'KPI Standardization',icon: GitMerge,       path: '/admin/kpi-standardization', menuKey: 'admin-kpi-standardization',  roles: ['admin'] },
   ],
   ```

2. **Remove those 7 entries** from `menuItems.admin`. Administration retains everything else (Admin Dashboard, User Management, Org KPI Data Entry, Org KPI Overview, PIP Management, Import Data, System Settings, Audit Logs, Observations, Rollback Requests, Email Logs, Pending Reviews, Incentive Config/Data, Increment Inputs, Employee Development).

3. **Route classification** — extend `getSectionForPath` so the moved routes resolve to the new group (so it auto-expands on direct nav):
   ```ts
   const KRA_SETTINGS_PATHS = new Set([
     '/admin/templates','/admin/bundles','/admin/kpis','/admin/categories',
     '/admin/kpi-mapping','/admin/kpi-weightage','/admin/kpi-standardization',
   ]);
   if (KRA_SETTINGS_PATHS.has(pathname)) return 'kraSettings';
   ```
   (Checked before the generic `/admin` → `admin` fallback.)

4. **Render the group** — add a `<CollapsibleSidebarGroup label="KRA Settings" …>` block in the SidebarContent JSX, placed **immediately above the Administration group**.

## UI Preview

```text
SIDEBAR
─────────────────────────────
Main
Manager Review
Management
HR PMS
Audit
Data Entry

KRA SETTINGS              ▾   ← NEW collapsible group
  📚 KRA Library
  📦 KRA Bundles
  🎯 All KRAs
  📋 KRA Categories
  🎯 KPI Mapping
  % Weightage Matrix
  ⇆ KPI Standardization

ADMINISTRATION            ▾   ← these 7 items removed from here
  Admin Dashboard
  User Management
  Org KPI Data Entry
  Org KPI Overview
  PIP Management
  Import Data
  System Settings
  Audit Logs
  Observations
  Rollback Requests
  Email Logs
  Pending Reviews
  Incentive Config
  Incentive Data Entry
  Increment Inputs
  Employee Development

Reports
```

## Out of scope
- No route changes — URLs, pages, and permissions (`menuKey` access via `useMenuAccess`) are preserved exactly.
- No DB/menu-access-rights schema changes; existing menu keys continue to gate visibility.
- No changes to PageHeader titles on the individual pages.

## Risk
Low — pure sidebar reorganization. Existing `menuKey` access control, deep-links, and routes continue to work; only the visual grouping changes.

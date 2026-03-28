

## Add Sidebar Menu Access Rights to System Settings

### What You Asked For
Create a "Menu Access" configuration in System Settings (similar to Report Access) where admins can control which roles can see which sidebar menu items and sub-menus.

### Approach

**Database**: Two new tables mirroring the report access pattern:
- `menu_access_config` — stores each menu item with its allowed roles
- `menu_access_user_overrides` — per-user overrides (optional, same pattern as reports)

**Seeding**: A migration seeds all current sidebar menu items (from `getStaticMenuItems`) with their current hardcoded role arrays as defaults.

**Hook**: `useMenuAccess` — fetches menu configs, provides `canAccessMenu(menuKey)` check. Falls back to current hardcoded roles if DB is empty.

**Admin UI**: New "Menu Access" tab in System Settings (next to "Report Access") with:
- Table listing all menu items grouped by section (Main, Manager, Admin, Reports, etc.)
- Checkboxes per role for each menu item (same UX as ReportAccessTab)
- Save per row
- Optional: User-level overrides section

**Sidebar Integration**: `AppSidebar.tsx` replaces hardcoded `roles` arrays with DB-driven config from `useMenuAccess`. The `filterByRole` callback checks `canAccessMenu(item.key)` instead of `item.roles.includes(effectiveRole)`.

### Implementation

#### 1. Database Migration
```sql
CREATE TABLE public.menu_access_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  menu_key TEXT UNIQUE NOT NULL,        -- e.g. 'dashboard', 'team-reviews', 'admin-users'
  menu_name TEXT NOT NULL,              -- Display name: 'My Dashboard', 'User Management'
  section TEXT NOT NULL,                -- 'main', 'manager', 'admin', 'reports', etc.
  allowed_roles TEXT[] NOT NULL DEFAULT '{}',
  display_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.menu_access_config ENABLE ROW LEVEL SECURITY;

-- Admin-only CRUD, authenticated read
CREATE POLICY "Anyone authenticated can read menu config"
  ON public.menu_access_config FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage menu config"
  ON public.menu_access_config FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Seed with current hardcoded defaults (all menu items from AppSidebar)
INSERT INTO public.menu_access_config (menu_key, menu_name, section, allowed_roles, display_order) VALUES
  ('dashboard', 'My Dashboard', 'main', '{admin,manager,employee,auditor,management,hr_pms,skip_level}', 1),
  ('inbox', 'Inbox', 'main', '{employee,manager,admin,auditor,management,hr_pms,skip_level}', 2),
  ('pms-policy', 'PMS Policy', 'main', '{admin,manager,employee,auditor,management,hr_pms}', 3),
  ('team-reviews', 'Team Reviews', 'manager', '{manager,admin,management,skip_level}', 10),
  ('hr-pms-review', 'HR PMS Review', 'hr_pms', '{hr_pms,admin}', 20),
  ('management-dashboard', 'Management Dashboard', 'management', '{management,admin}', 30),
  ('management-review', 'Management Review', 'management', '{management,admin}', 31),
  ('audit-panel', 'Audit Panel', 'audit', '{auditor,admin}', 40),
  -- Admin items (50+)
  ('admin-dashboard', 'Admin Dashboard', 'admin', '{admin}', 50),
  ('admin-users', 'User Management', 'admin', '{admin}', 51),
  ('admin-templates', 'KRA Library', 'admin', '{admin}', 52),
  ('admin-bundles', 'KRA Bundles', 'admin', '{admin}', 53),
  ('admin-kpis', 'All KRAs', 'admin', '{admin}', 54),
  ('admin-org-kpi-data', 'Org KPI Data Entry', 'admin', '{admin}', 55),
  ('admin-org-kpi-overview', 'Org KPI Overview', 'admin', '{admin}', 56),
  ('admin-pip', 'PIP Management', 'admin', '{admin}', 57),
  ('admin-workflow', 'Workflow Config', 'admin', '{admin}', 58),
  ('admin-organization', 'Organization', 'admin', '{admin}', 59),
  ('admin-categories', 'KRA Categories', 'admin', '{admin}', 60),
  ('admin-review-periods', 'Review Periods', 'admin', '{admin}', 61),
  ('admin-import', 'Import Data', 'admin', '{admin}', 62),
  ('admin-settings', 'System Settings', 'admin', '{admin}', 63),
  ('admin-audit-logs', 'Audit Logs', 'admin', '{admin}', 64),
  ('admin-observations', 'Observations', 'admin', '{admin}', 65),
  ('admin-rollback', 'Rollback Requests', 'admin', '{admin}', 66),
  ('admin-email-logs', 'Email Logs', 'admin', '{admin}', 67),
  ('admin-kpi-mapping', 'KPI Mapping', 'admin', '{admin}', 68),
  ('admin-weightage', 'Weightage Matrix', 'admin', '{admin}', 69),
  ('admin-pending-reviews', 'Pending Reviews', 'admin', '{admin}', 70),
  ('admin-incentive', 'Incentive Config', 'admin', '{admin}', 71),
  ('admin-development', 'Employee Development', 'admin', '{admin,hr_pms}', 72),
  -- Reports (100+)
  ('reports-hub', 'View Reports', 'reports', '{admin,manager,auditor,management}', 100),
  ('reports-performance', 'Performance Report', 'reports', '{admin,manager,auditor}', 101),
  ('reports-kra-issuance', 'KRA Issuance', 'reports', '{admin,manager,auditor}', 102),
  ('reports-tni', 'TNI Report', 'reports', '{admin,manager,auditor}', 103),
  ('reports-incentive', 'Incentive Report', 'reports', '{admin,management,hr_pms}', 104),
  ('reports-manager-team', 'Manager Team KPI', 'reports', '{admin,manager,management,hr_pms}', 105)
ON CONFLICT (menu_key) DO NOTHING;
```

#### 2. New Hook: `src/hooks/useMenuAccess.ts`
- Fetches `menu_access_config` with 5-min staleTime
- Provides `canAccess(menuKey: string): boolean` — checks if `effectiveRole` is in `allowed_roles`
- Provides `getMenuRoles(menuKey: string): AppRole[]` — returns allowed roles for a menu item
- Update mutation for admin to save role changes
- Falls back to hardcoded roles when DB row doesn't exist

#### 3. New Component: `src/components/admin/MenuAccessTab.tsx`
- Same layout as `ReportAccessTab` — table with menu items grouped by section
- Columns: Menu Item | Section | Allowed Roles (checkboxes) | Save
- Section headers as visual group separators
- No user-override section initially (can add later if needed)

#### 4. System Settings Integration
- Add `{ key: 'menu-access', label: 'Menu Access', icon: Menu }` to `SETTINGS_SECTIONS`
- Render `<MenuAccessTab />` when selected

#### 5. Sidebar Integration (`AppSidebar.tsx`)
- Import `useMenuAccess`
- Each menu item gets a `menuKey` property
- `filterByRole` checks `canAccess(item.menuKey)` instead of `item.roles.includes(effectiveRole)`
- Admin always retains access to System Settings (hardcoded safety guard)

### Files Changed
| File | Action |
|------|--------|
| Migration SQL | Create `menu_access_config` table + seed data |
| `src/hooks/useMenuAccess.ts` | New — hook for menu access config |
| `src/components/admin/MenuAccessTab.tsx` | New — admin UI for managing menu access |
| `src/pages/admin/SystemSettings.tsx` | Update — add Menu Access section |
| `src/components/layout/AppSidebar.tsx` | Update — use DB-driven menu access |
| `DOCUMENTATION.md` | Update — document menu access feature |

### Risk Assessment
- **Data**: Additive — new table with seed data matching current hardcoded values. Zero behavioral change until admin modifies config.
- **Regression**: Safety guard ensures admin always keeps System Settings access (prevents lockout).
- **Security**: RLS ensures only admins can modify, all authenticated users can read.


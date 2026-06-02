/**
 * Menu Catalog — the SEED source of truth for menu_registry.
 *
 * Phase 2 MVP scope: AppSidebar items (L2) and System Settings tabs (L3).
 * L4 (Organization sub-tabs, Workflow Config sub-tabs, etc.) come in Phase 5.
 *
 * Every entry MUST keep its `menu_key` stable forever — it is the permission
 * key and the audit key. Add new entries; never rename existing ones.
 */
import type { MenuRegistryRow } from './types';

type CatalogEntry = Omit<MenuRegistryRow, 'module_key'> & { module_key?: string };

// --- Sidebar group container nodes (L1 placeholders inside PMS module) ------
// These hold sidebar groups so L2 items can declare a parent. They are not
// themselves clickable; UI ignores route_path = null grouping nodes when
// rendering link rows.
const SIDEBAR_GROUPS: CatalogEntry[] = [
  group('group-main',         'Main',            10),
  group('group-manager',      'Manager',         20),
  group('group-management',   'Management',      30),
  group('group-hr-pms',       'HR PMS',          40),
  group('group-audit',        'Audit',           50),
  group('group-data-entry',   'Data Entry',      60),
  group('group-kra-settings', 'KRA Settings',    70),
  group('group-incentive',    'Incentive',       80),
  group('group-admin',        'Administration',  90),
  group('group-reports',      'Reports',        100),
];

function group(key: string, label: string, sort: number): CatalogEntry {
  return {
    menu_key: key,
    default_label: label,
    default_parent_key: null,
    menu_level: 2,
    route_path: null,
    icon_name: null,
    default_sort_order: sort,
    accepts_children: true,
    is_renamable: true,
    is_movable: false, // L1 groups are pinned in Phase 2
    is_cross_app_movable: false,
    is_system_required: true,
    feature_key: null,
    permission_key: null,
  };
}

function item(
  menu_key: string,
  default_label: string,
  default_parent_key: string,
  default_sort_order: number,
  route_path: string | null,
  opts: Partial<CatalogEntry> = {},
): CatalogEntry {
  return {
    menu_key,
    default_label,
    default_parent_key,
    menu_level: 2,
    route_path,
    icon_name: null,
    default_sort_order,
    accepts_children: false,
    is_renamable: true,
    is_movable: true,
    is_cross_app_movable: false,
    is_system_required: false,
    feature_key: null,
    permission_key: menu_key,
    ...opts,
  };
}

function tab(
  menu_key: string,
  default_label: string,
  default_sort_order: number,
  opts: Partial<CatalogEntry> = {},
): CatalogEntry {
  return {
    menu_key,
    default_label,
    default_parent_key: 'admin-settings',
    menu_level: 3,
    route_path: null,
    icon_name: null,
    default_sort_order,
    accepts_children: false,
    is_renamable: true,
    is_movable: true,
    is_cross_app_movable: false,
    is_system_required: false,
    feature_key: null,
    permission_key: menu_key,
    ...opts,
  };
}

// --- Sidebar L2 items (must match AppSidebar.menuItems) ---------------------
const SIDEBAR_ITEMS: CatalogEntry[] = [
  // main
  item('dashboard',          'My Dashboard',           'group-main',        10, '/dashboard',     { is_movable: false, is_system_required: true }),
  item('inbox',              'Inbox',                  'group-main',        20, '/queries',       { is_system_required: true }),
  item('pms-policy',         'PMS Policy',             'group-main',        30, '/pms-policy'),
  item('registry-browser',   'KPI Registry',           'group-main',        40, '/registry'),
  // manager
  item('team-reviews',       'Team Reviews',           'group-manager',     10, '/dashboard?view=team'),
  // management
  item('management-dashboard','Management Dashboard',  'group-management',  10, '/management-dashboard'),
  item('management-review',  'Management Review',      'group-management',  20, '/dashboard?view=management'),
  // hr_pms
  item('hr-pms-review',      'HR PMS Review',          'group-hr-pms',      10, '/dashboard?view=hr_pms'),
  // audit
  item('audit-panel',        'Audit Panel',            'group-audit',       10, '/dashboard?view=audit'),
  item('admin-org-kpi-audit','Org KPI Audit Review',   'group-audit',       20, '/admin/org-kpi-audit-review'),
  // data entry
  item('data-entry',         'Org KPI Data Entry',     'group-data-entry',  10, '/admin/org-kpi-data'),
  // KRA settings
  item('admin-templates',         'KRA Library',         'group-kra-settings', 10, '/admin/templates'),
  item('admin-bundles',           'KRA Bundles',         'group-kra-settings', 20, '/admin/bundles'),
  item('admin-kpis',              'All KRAs',            'group-kra-settings', 30, '/admin/kpis'),
  item('admin-categories',        'KRA Categories',      'group-kra-settings', 40, '/admin/categories'),
  item('admin-kpi-mapping',       'KPI Mapping',         'group-kra-settings', 50, '/admin/kpi-mapping'),
  item('admin-weightage',         'Weightage Matrix',    'group-kra-settings', 60, '/admin/kpi-weightage'),
  item('admin-kpi-standardization','KPI Standardization','group-kra-settings', 70, '/admin/kpi-standardization'),
  // incentive
  item('admin-incentive',        'Incentive Config',     'group-incentive',   10, '/admin/incentive-config'),
  item('admin-incentive-data',   'Incentive Data Entry', 'group-incentive',   20, '/admin/incentive-data-entry'),
  item('reports-incentive',      'Incentive Report',     'group-incentive',   30, '/reports/incentive'),
  // admin
  item('admin-dashboard',        'Admin Dashboard',      'group-admin',       10, '/admin'),
  item('admin-users',            'User Management',      'group-admin',       20, '/admin/users'),
  item('admin-org-kpi-data',     'Org KPI Data Entry',   'group-admin',       30, '/admin/org-kpi-data'),
  item('admin-org-kpi-overview', 'Org KPI Overview',     'group-admin',       40, '/admin/org-kpi-overview'),
  item('admin-pip',              'PIP Management',       'group-admin',       50, '/admin/pip'),
  item('admin-import',           'Import Data',          'group-admin',       60, '/admin/import'),
  item('admin-settings',         'System Settings',      'group-admin',       70, '/admin/settings', { accepts_children: true, is_movable: false, is_system_required: true }),
  item('admin-observations',     'Observations',         'group-admin',       80, '/admin/observations'),
  item('admin-rollback',         'Rollback Requests',    'group-admin',       90, '/admin/rollback-requests'),
  item('admin-pending-reviews',  'Pending Reviews',      'group-admin',      100, '/admin/pending-reviews'),
  item('admin-increment-inputs', 'Increment Inputs',     'group-admin',      110, '/admin/increment-inputs'),
  item('admin-development',      'Employee Development', 'group-admin',      120, '/admin/employee-development'),
  // reports
  item('reports-hub',         'View Reports',         'group-reports',     10, '/reports'),
  item('reports-performance', 'Performance Report',   'group-reports',     20, '/reports/performance'),
  item('reports-kra-issuance','KRA Issuance',         'group-reports',     30, '/reports/kra-issuance'),
  item('reports-tni',         'TNI Report',           'group-reports',     40, '/reports/tni'),
];

// --- System Settings L3 tabs (must match SETTINGS_SECTIONS) -----------------
const SETTINGS_TABS: CatalogEntry[] = [
  tab('admin-settings-branding',       'Branding',          10),
  tab('admin-settings-general',        'General',           20),
  tab('admin-settings-workflow',       'Workflow Config',   30),
  tab('admin-settings-organization',   'Organization',      40),
  tab('admin-menu-setting',            'Menu Setting',      50, { is_movable: false, is_system_required: true }),
  tab('admin-settings-review-periods', 'Review Periods',    60),
  tab('admin-settings-scoring',        'Scoring',           70),
  tab('admin-settings-increment',      'Increment',         80),
  tab('admin-settings-cycles',         'Cycles',            90),
  tab('admin-settings-controls',       'Controls',         100),
  tab('admin-settings-uploads',        'Uploads',          110),
  tab('admin-settings-reports',        'Report Access',    120),
  tab('admin-settings-menu-access',    'Menu Access',      130),
  tab('admin-settings-email',          'Email',            140),
  tab('admin-settings-templates',      'Templates',        150),
  tab('admin-settings-passwords',      'Passwords',        160),
  tab('admin-settings-report-builder', 'Report Builder',   170),
  tab('admin-settings-backups',        'Backups',          180),
  tab('admin-settings-data-repair',    'Data Repair',      190),
  tab('admin-settings-feature-flags',  'Feature Flags',    200),
  tab('admin-settings-module-hub',     'Module Hub',       210),
  tab('admin-settings-logs',           'Logs',             220),
];

/** Maps the System Settings section.key (in SystemSettings.tsx) → menu_key. */
export const SETTINGS_SECTION_KEY_TO_MENU_KEY: Record<string, string> = {
  'branding':       'admin-settings-branding',
  'general':        'admin-settings-general',
  'workflow':       'admin-settings-workflow',
  'organization':   'admin-settings-organization',
  'menu-setting':   'admin-menu-setting',
  'review-periods': 'admin-settings-review-periods',
  'scoring':        'admin-settings-scoring',
  'increment':      'admin-settings-increment',
  'cycles':         'admin-settings-cycles',
  'controls':       'admin-settings-controls',
  'uploads':        'admin-settings-uploads',
  'reports':        'admin-settings-reports',
  'menu-access':    'admin-settings-menu-access',
  'email':          'admin-settings-email',
  'templates':      'admin-settings-templates',
  'passwords':      'admin-settings-passwords',
  'report-builder': 'admin-settings-report-builder',
  'backups':        'admin-settings-backups',
  'data-repair':    'admin-settings-data-repair',
  'feature-flags':  'admin-settings-feature-flags',
  'module-hub':     'admin-settings-module-hub',
  'logs':           'admin-settings-logs',
};

export const MENU_CATALOG: MenuRegistryRow[] = [
  ...SIDEBAR_GROUPS,
  ...SIDEBAR_ITEMS,
  ...SETTINGS_TABS,
].map((e) => ({ module_key: 'pms', ...e })) as MenuRegistryRow[];

export const MENU_CATALOG_BY_KEY: Record<string, MenuRegistryRow> = Object.fromEntries(
  MENU_CATALOG.map((r) => [r.menu_key, r]),
);
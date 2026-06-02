/**
 * Curated list of routes that admins may bind a custom menu item to.
 * Keeping this static (instead of scraping App.tsx) makes the dropdown
 * predictable and prevents accidentally exposing internal/edit routes.
 */
export interface KnownRoute {
  path: string;
  label: string;
}

export const KNOWN_ROUTES: ReadonlyArray<KnownRoute> = [
  { path: '/dashboard', label: 'My Dashboard' },
  { path: '/queries', label: 'Inbox' },
  { path: '/pms-policy', label: 'PMS Policy' },
  { path: '/registry', label: 'KPI Registry' },
  { path: '/profile', label: 'Profile Settings' },
  { path: '/management-dashboard', label: 'Management Dashboard' },
  { path: '/audit-logs', label: 'Audit Logs' },
  { path: '/admin', label: 'Admin Dashboard' },
  { path: '/admin/users', label: 'User Management' },
  { path: '/admin/iac', label: 'Identity & Access' },
  { path: '/admin/kpis', label: 'All KRAs' },
  { path: '/admin/templates', label: 'KRA Library' },
  { path: '/admin/bundles', label: 'KRA Bundles' },
  { path: '/admin/categories', label: 'KRA Categories' },
  { path: '/admin/kpi-mapping', label: 'KPI Mapping' },
  { path: '/admin/kpi-weightage', label: 'Weightage Matrix' },
  { path: '/admin/kpi-standardization', label: 'KPI Standardization' },
  { path: '/admin/org-kpi-data', label: 'Org KPI Data Entry' },
  { path: '/admin/org-kpi-overview', label: 'Org KPI Overview' },
  { path: '/admin/org-kpi-audit-review', label: 'Org KPI Audit Review' },
  { path: '/admin/pip', label: 'PIP Management' },
  { path: '/admin/import', label: 'Import Data' },
  { path: '/admin/settings', label: 'System Settings' },
  { path: '/admin/observations', label: 'Observations' },
  { path: '/admin/rollback-requests', label: 'Rollback Requests' },
  { path: '/admin/pending-reviews', label: 'Pending Reviews' },
  { path: '/admin/increment-inputs', label: 'Increment Inputs' },
  { path: '/admin/employee-development', label: 'Employee Development' },
  { path: '/admin/incentive-config', label: 'Incentive Config' },
  { path: '/admin/incentive-data-entry', label: 'Incentive Data Entry' },
  { path: '/reports', label: 'Reports Hub' },
  { path: '/reports/performance', label: 'Performance Report' },
  { path: '/reports/kra-issuance', label: 'KRA Issuance Report' },
  { path: '/reports/tni', label: 'TNI Report' },
  { path: '/reports/incentive', label: 'Incentive Report' },
];
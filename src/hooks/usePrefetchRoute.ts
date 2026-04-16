import { useCallback } from 'react';

/**
 * Maps route paths to their dynamic import functions so that hovering a
 * sidebar link warms the chunk cache. The browser will start downloading
 * the route's JS while the user is still moving the cursor toward it,
 * making the eventual click feel near-instant.
 *
 * Only entries that exist in App.tsx's lazy() declarations should be added.
 */
const ROUTE_LOADERS: Record<string, () => Promise<unknown>> = {
  '/dashboard': () => import('@/pages/Dashboard'),
  '/queries': () => import('@/pages/QueryInbox'),
  '/profile': () => import('@/pages/ProfileSettings'),
  '/pms-policy': () => import('@/pages/PMSPolicy'),
  '/audit-logs': () => import('@/pages/AuditLogs'),
  '/management-dashboard': () => import('@/pages/ManagementDashboard'),

  // Admin
  '/admin': () => import('@/pages/admin/AdminDashboard'),
  '/admin/users': () => import('@/pages/admin/UserManagement'),
  '/admin/kpis': () => import('@/pages/admin/AllKpis'),
  '/admin/organization': () => import('@/pages/admin/Organization'),
  '/admin/categories': () => import('@/pages/admin/Categories'),
  '/admin/review-periods': () => import('@/pages/admin/ReviewPeriods'),
  '/admin/import': () => import('@/pages/admin/ImportData'),
  '/admin/settings': () => import('@/pages/admin/SystemSettings'),
  '/admin/workflow-config': () => import('@/pages/admin/WorkflowConfig'),
  '/admin/org-kpi-data': () => import('@/pages/admin/OrgKpiDataEntry'),
  '/admin/org-kpi-overview': () => import('@/pages/admin/OrgKpiOverview'),
  '/admin/templates': () => import('@/pages/admin/KRALibrary'),
  '/admin/bundles': () => import('@/pages/admin/TemplateBundles'),
  '/admin/pip': () => import('@/pages/admin/PIPManagement'),
  '/admin/observations': () => import('@/pages/admin/ObservationsOverview'),
  '/admin/email-logs': () => import('@/pages/admin/EmailLogs'),
  '/admin/rollback-requests': () => import('@/pages/admin/RollbackRequests'),
  '/admin/kpi-mapping': () => import('@/pages/admin/KpiMappingMatrix'),
  '/admin/kpi-weightage': () => import('@/pages/admin/KpiWeightageDashboard'),
  '/admin/pending-reviews': () => import('@/pages/admin/PendingSelfReviews'),
  '/admin/incentive-config': () => import('@/pages/admin/IncentiveConfig'),
  '/admin/employee-development': () => import('@/pages/admin/EmployeeDevelopment'),

  // Reports
  '/reports': () => import('@/pages/reports/ReportsHub'),
  '/reports/performance': () => import('@/pages/reports/PerformanceReport'),
  '/reports/kra-issuance': () => import('@/pages/reports/KRAIssuance'),
  '/reports/queries': () => import('@/pages/reports/QueryReport'),
  '/reports/department': () => import('@/pages/reports/DepartmentReport'),
  '/reports/completion': () => import('@/pages/reports/CompletionReport'),
  '/reports/audit-trail': () => import('@/pages/reports/AuditTrailReport'),
  '/reports/monthly-scorecard': () => import('@/pages/reports/MonthlyScorecardReport'),
  '/reports/employee-summary': () => import('@/pages/reports/EmployeePerformanceSummary'),
  '/reports/tni': () => import('@/pages/reports/TNIReport'),
  '/reports/issues': () => import('@/pages/reports/IssuesReport'),
  '/reports/kpi-detail': () => import('@/pages/reports/KpiDetailReport'),
  '/reports/bottleneck': () => import('@/pages/reports/BottleneckReport'),
  '/reports/kpi-status-tracker': () => import('@/pages/reports/KpiStatusTracker'),
  '/reports/kpi-journey': () => import('@/pages/reports/KpiJourneyReport'),
};

const prefetched = new Set<string>();

export function prefetchRoute(path: string) {
  // Strip query/hash for matching
  const clean = path.split('?')[0].split('#')[0];
  if (prefetched.has(clean)) return;
  const loader = ROUTE_LOADERS[clean];
  if (!loader) return;
  prefetched.add(clean);
  // Fire and forget — Vite/Rollup will cache the chunk in the browser
  loader().catch(() => {
    // Allow retry if it failed
    prefetched.delete(clean);
  });
}

/**
 * Returns a stable handler that warms the chunk cache for a given route.
 * Attach to onMouseEnter / onFocus on nav links.
 */
export function usePrefetchRoute() {
  return useCallback((path: string) => prefetchRoute(path), []);
}

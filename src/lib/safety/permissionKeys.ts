/**
 * Safety Module — permission key catalog (SSOT mirror of DB seed).
 * The DB table `safety_permission_keys` is the source of truth; this file
 * mirrors the keys so the TypeScript layer can reference them safely.
 */

export const SAFETY_NAV_KEYS = {
  home:          'nav.home',
  incidents:     'nav.incidents',
  permits:       'nav.permits',
  assets:        'nav.assets',
  audits:        'nav.audits',
  emergency:     'nav.emergency',
  trainingMy:    'nav.training_my',
  trainingAdmin: 'nav.training_admin',
  analytics:     'nav.analytics',
  hoursWorked:   'nav.hours_worked',
  permitTypes:   'nav.permit_types',
  slaMonitor:    'nav.sla_monitor',
  usersRoles:    'nav.users_roles',
  auditLog:      'nav.audit_log',
} as const;

export type SafetyPermissionKey = string; // open string — keys live in DB

/** Map every safety URL prefix to the nav permission key that gates it. */
export const ROUTE_TO_PERMISSION: Array<{ test: (path: string) => boolean; key: string }> = [
  { test: (p) => p === '/safety' || p === '/safety/',                          key: SAFETY_NAV_KEYS.home },
  { test: (p) => p.startsWith('/safety/incidents'),                            key: SAFETY_NAV_KEYS.incidents },
  { test: (p) => p.startsWith('/safety/permits') && !p.includes('/settings/'), key: SAFETY_NAV_KEYS.permits },
  { test: (p) => p.startsWith('/safety/assets'),                               key: SAFETY_NAV_KEYS.assets },
  { test: (p) => p.startsWith('/safety/audits'),                               key: SAFETY_NAV_KEYS.audits },
  { test: (p) => p === '/safety/emergency' || p.startsWith('/safety/emergency/'), key: SAFETY_NAV_KEYS.emergency },
  { test: (p) => p === '/safety/training',                                     key: SAFETY_NAV_KEYS.trainingMy },
  { test: (p) => p.startsWith('/safety/training/admin'),                       key: SAFETY_NAV_KEYS.trainingAdmin },
  { test: (p) => p.startsWith('/safety/analytics'),                            key: SAFETY_NAV_KEYS.analytics },
  { test: (p) => p.startsWith('/safety/settings/hours-worked'),                key: SAFETY_NAV_KEYS.hoursWorked },
  { test: (p) => p.startsWith('/safety/settings/permit-types'),                key: SAFETY_NAV_KEYS.permitTypes },
  { test: (p) => p.startsWith('/safety/settings/sla'),                         key: SAFETY_NAV_KEYS.slaMonitor },
  { test: (p) => p.startsWith('/safety/settings/users'),                       key: SAFETY_NAV_KEYS.usersRoles },
  { test: (p) => p.startsWith('/safety/settings/audit'),                       key: SAFETY_NAV_KEYS.auditLog },
];

export function permissionForRoute(pathname: string): string | null {
  const hit = ROUTE_TO_PERMISSION.find((r) => r.test(pathname));
  return hit ? hit.key : null;
}
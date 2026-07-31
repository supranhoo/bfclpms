/**
 * Report Access catalogue — SSOT for which reports are MAPPABLE in
 * Admin → System Settings → Report Access.
 *
 * POLICY §RPT-ACCESS-REGISTRY-SSOT:
 * every active `report_registry` report must be listed for mapping, whether or
 * not a `report_access_config` row exists yet. Reports without a config row are
 * surfaced as "Unmapped" and fall back to the defaults below (admin-only when
 * no default is declared).
 */
import type { AppRole } from '@/lib/roles';

export interface ReportAccessDefault {
  view_roles: AppRole[];
  download_roles: AppRole[];
}

/** Fallback role access used when a report has no `report_access_config` row. */
export const DEFAULT_REPORT_ACCESS: Record<string, ReportAccessDefault> = {
  'employee-summary': { view_roles: ['manager', 'admin', 'auditor', 'management'], download_roles: ['admin'] },
  'performance': { view_roles: ['manager', 'admin', 'auditor', 'management'], download_roles: ['admin'] },
  'monthly-scorecard': { view_roles: ['manager', 'admin', 'auditor', 'management'], download_roles: ['admin'] },
  'kra-issuance': { view_roles: ['manager', 'admin', 'management'], download_roles: ['admin'] },
  'queries': { view_roles: ['manager', 'admin', 'auditor', 'management'], download_roles: ['admin'] },
  'issues': { view_roles: ['manager', 'admin', 'auditor', 'management'], download_roles: ['admin'] },
  'completion': { view_roles: ['manager', 'admin', 'management'], download_roles: ['admin'] },
  'department': { view_roles: ['manager', 'admin', 'management'], download_roles: ['admin'] },
  'audit-trail': { view_roles: ['admin', 'auditor'], download_roles: ['admin'] },
  'tni': { view_roles: ['manager', 'admin', 'management'], download_roles: ['admin'] },
  'kpi-detail': { view_roles: ['manager', 'admin', 'auditor', 'management', 'hr_pms'], download_roles: ['admin'] },
  'bottleneck': { view_roles: ['admin', 'auditor', 'management'], download_roles: ['admin'] },
  'kpi-status-tracker': { view_roles: ['admin'], download_roles: ['admin'] },
  'kpi-journey': { view_roles: ['admin', 'auditor', 'management'], download_roles: ['admin'] },
  'incentive': { view_roles: ['admin', 'management', 'hr_pms'], download_roles: ['admin'] },
  'manager-team-kpi': { view_roles: ['admin', 'manager', 'management', 'hr_pms'], download_roles: ['admin'] },
  'team-vs-manager-score': { view_roles: ['admin', 'manager', 'management', 'hr_pms'], download_roles: ['admin'] },
  // Org-wide report — managers excluded by default since RLS restricts them to direct reports,
  // which would silently return 0 rows. Grant via per-user override if a manager needs access.
  'kpi-scorecard-detail': { view_roles: ['admin', 'management', 'hr_pms', 'auditor'], download_roles: ['admin'] },
  'kpi-employee-matrix': { view_roles: ['admin', 'manager', 'management', 'hr_pms', 'auditor'], download_roles: ['admin'] },
  'workflow-resolution': { view_roles: ['admin', 'hr_pms', 'management', 'auditor'], download_roles: ['admin', 'hr_pms'] },
  // ADR-213 — audit surface: admins and HR PMS only.
  'change-history': { view_roles: ['admin', 'hr_pms'], download_roles: ['admin'] },
  'dev-report': { view_roles: ['admin', 'management', 'auditor'], download_roles: ['admin', 'management'] },
  'annual-review': { view_roles: ['admin', 'manager', 'management', 'hr_pms', 'auditor'], download_roles: ['admin', 'hr_pms', 'management'] },
};

/** Least-privilege fallback for a report with no declared default. */
export const FALLBACK_REPORT_ACCESS: ReportAccessDefault = {
  view_roles: ['admin'],
  download_roles: ['admin'],
};

export function getDefaultReportAccess(reportKey: string): ReportAccessDefault {
  return DEFAULT_REPORT_ACCESS[reportKey] ?? FALLBACK_REPORT_ACCESS;
}

export interface RegistryEntry {
  report_key: string;
  display_name: string;
  is_active?: boolean;
}

export interface ConfigEntry {
  report_key: string;
  report_name: string;
  view_roles: AppRole[];
  download_roles: AppRole[];
}

export interface MappableReport {
  report_key: string;
  report_name: string;
  view_roles: AppRole[];
  download_roles: AppRole[];
  /** false ⇒ no `report_access_config` row yet; values shown are defaults. */
  isConfigured: boolean;
}

/**
 * Union of the active report registry and existing access config rows.
 * Registry is the catalogue; config supplies the saved values.
 */
export function buildMappableReports(
  registry: RegistryEntry[],
  configs: ConfigEntry[],
): MappableReport[] {
  const byKey = new Map<string, MappableReport>();

  for (const reg of registry) {
    if (reg.is_active === false) continue;
    const def = getDefaultReportAccess(reg.report_key);
    byKey.set(reg.report_key, {
      report_key: reg.report_key,
      report_name: reg.display_name,
      view_roles: [...def.view_roles],
      download_roles: [...def.download_roles],
      isConfigured: false,
    });
  }

  for (const cfg of configs) {
    byKey.set(cfg.report_key, {
      report_key: cfg.report_key,
      report_name: byKey.get(cfg.report_key)?.report_name || cfg.report_name,
      view_roles: cfg.view_roles ?? [],
      download_roles: cfg.download_roles ?? [],
      isConfigured: true,
    });
  }

  return [...byKey.values()].sort((a, b) => a.report_name.localeCompare(b.report_name));
}

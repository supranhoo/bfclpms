import { useWorkflowSettings } from '@/hooks/useWorkflowSettings';
import { AppRole } from '@/lib/roles';

/**
 * Config for the Annual Review Admin "Download" menu. All keys live in
 * `workflow_settings` (category=`export`) and default to safe values so the
 * menu works out-of-the-box for admin + hr_pms.
 */
export interface AnnualReviewExportConfig {
  isEnabled: boolean;
  excelRoles: string[];
  pdfRoles: string[];
  visibleColumns: string[];
  showLogo: boolean;
  showEmployeeDetails: boolean;
  isLoading: boolean;
}

const DEFAULT_ROLES = ['admin', 'hr_pms'];
const DEFAULT_COLUMNS = [
  'employee_code', 'full_name', 'designation', 'department', 'business_unit', 'manager',
  'overall_status', 'enabled_stages',
  'score_self', 'score_manager', 'score_skip', 'score_bu', 'score_hr',
  'criteria_weighted_score', 'total_score', 'final_rating',
  'system_scores', 'eligibility_inputs',
  'has_override', 'finalized_at', 'acknowledged_at',
];

function parseJsonArray(value: unknown, fallback: string[]): string[] {
  if (Array.isArray(value)) return value as string[];
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : fallback;
    } catch {
      return fallback;
    }
  }
  return fallback;
}

function parseBool(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return fallback;
}

export function useAnnualReviewExportConfig(): AnnualReviewExportConfig {
  const { data: settings = [], isLoading } = useWorkflowSettings('export' as any);
  const get = (k: string) => settings.find((s) => s.setting_key === k)?.setting_value;

  return {
    isEnabled: parseBool(get('annual_review_export_enabled'), true),
    excelRoles: parseJsonArray(get('annual_review_export_roles'), DEFAULT_ROLES),
    pdfRoles: parseJsonArray(get('annual_review_export_pdf_roles'), DEFAULT_ROLES),
    visibleColumns: parseJsonArray(get('annual_review_export_columns'), DEFAULT_COLUMNS),
    showLogo: parseBool(get('annual_review_export_show_logo'), true),
    showEmployeeDetails: parseBool(get('annual_review_export_show_employee_details'), true),
    isLoading,
  };
}

export function canUseAnnualReviewExport(roles: string[], userRole: AppRole | null): boolean {
  if (!userRole) return false;
  return roles.includes(userRole);
}

export const ANNUAL_REVIEW_EXPORT_DEFAULT_COLUMNS = DEFAULT_COLUMNS;
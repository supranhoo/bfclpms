import { useWorkflowSettings } from '@/hooks/useWorkflowSettings';
import { AppRole } from '@/lib/roles';

export interface KraExportConfig {
  isEnabled: boolean;
  previewRoles: string[];
  downloadRoles: string[];
  emailRoles: string[];
  excelRoles: string[];
  visibleColumns: string[];
  showLogo: boolean;
  showEmployeeDetails: boolean;
  isLoading: boolean;
}

function parseJsonArray(value: unknown): string[] {
  if (Array.isArray(value)) return value as string[];
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function parseBool(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return true;
}

export function useKraExportConfig(): KraExportConfig {
  const { data: settings = [], isLoading } = useWorkflowSettings('export' as any);

  const getValue = (key: string) => settings.find(s => s.setting_key === key)?.setting_value;

  return {
    isEnabled: parseBool(getValue('kra_export_enabled') ?? true),
    previewRoles: parseJsonArray(getValue('kra_export_preview_roles')),
    downloadRoles: parseJsonArray(getValue('kra_export_download_roles')),
    emailRoles: parseJsonArray(getValue('kra_export_email_roles')),
    excelRoles: parseJsonArray(getValue('kra_export_excel_roles')),
    visibleColumns: parseJsonArray(getValue('kra_export_columns')),
    showLogo: parseBool(getValue('kra_export_show_logo') ?? true),
    showEmployeeDetails: parseBool(getValue('kra_export_show_employee_details') ?? true),
    isLoading,
  };
}

export function canAccess(roles: string[], userRole: AppRole | null): boolean {
  if (!userRole) return false;
  return roles.includes(userRole);
}

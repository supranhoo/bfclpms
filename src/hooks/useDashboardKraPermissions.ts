import { useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useWorkflowSetting } from '@/hooks/useWorkflowSettings';

/**
 * Gate for dashboard-level Add KRA / Delete KRA actions.
 *
 * Reads the `dashboard_kra_management_roles` workflow setting (JSON array of
 * role keys) and matches it against the current user's effective role.
 * Admin is always allowed as a safety net.
 *
 * Returns booleans for `canAdd` and `canDelete` (currently both controlled by
 * the same allowlist; split later if ever needed).
 */
export function useDashboardKraPermissions() {
  const { effectiveRole } = useAuth();
  const { data: setting } = useWorkflowSetting('dashboard_kra_management_roles');

  return useMemo(() => {
    let allowed: string[] = ['admin'];
    const raw = setting?.setting_value;
    if (raw != null) {
      try {
        const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
        if (Array.isArray(parsed) && parsed.every((r) => typeof r === 'string')) {
          allowed = parsed;
        }
      } catch {
        allowed = ['admin'];
      }
    }
    const isAdmin = effectiveRole === 'admin';
    const inList = !!effectiveRole && allowed.includes(effectiveRole);
    const granted = isAdmin || inList;
    return {
      allowedRoles: allowed,
      canAdd: granted,
      canDelete: granted,
    };
  }, [effectiveRole, setting?.setting_value]);
}
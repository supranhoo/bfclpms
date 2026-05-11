import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import type { AppRole } from '@/lib/roles';

export interface ReportAccessConfig {
  id: string;
  report_key: string;
  report_name: string;
  view_roles: AppRole[];
  download_roles: AppRole[];
  created_at: string;
  updated_at: string;
}

export interface ReportAccessUserOverride {
  id: string;
  report_key: string;
  user_id: string;
  can_view: boolean;
  can_download: boolean;
  granted_by: string | null;
  created_at: string;
}

// Default fallback when DB is empty (matches previous hardcoded routes)
const DEFAULT_CONFIGS: Record<string, { view_roles: AppRole[]; download_roles: AppRole[] }> = {
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
};

export function useReportAccess() {
  const { user, effectiveRole } = useAuth();
  const queryClient = useQueryClient();

  const { data: configs = [], isLoading: configsLoading } = useQuery({
    queryKey: ['report-access-config'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('report_access_config')
        .select('*')
        .order('report_name');
      if (error) throw error;
      return (data || []) as ReportAccessConfig[];
    },
    staleTime: 5 * 60 * 1000,
  });

  const { data: userOverrides = [], isLoading: overridesLoading } = useQuery({
    queryKey: ['report-access-user-overrides'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('report_access_user_overrides')
        .select('*');
      if (error) throw error;
      return (data || []) as ReportAccessUserOverride[];
    },
    staleTime: 5 * 60 * 1000,
  });

  const canView = (reportKey: string): boolean => {
    if (!effectiveRole && !user) return false;

    // Check user override first
    if (user) {
      const override = userOverrides.find(o => o.report_key === reportKey && o.user_id === user.id);
      if (override?.can_view) return true;
    }

    // Check role-based config
    const config = configs.find(c => c.report_key === reportKey);
    if (config) {
      return effectiveRole ? config.view_roles.includes(effectiveRole) : false;
    }

    // Fallback to defaults
    const def = DEFAULT_CONFIGS[reportKey];
    return def && effectiveRole ? def.view_roles.includes(effectiveRole) : false;
  };

  const canDownload = (reportKey: string): boolean => {
    if (!effectiveRole && !user) return false;

    // Check user override first
    if (user) {
      const override = userOverrides.find(o => o.report_key === reportKey && o.user_id === user.id);
      if (override?.can_download) return true;
    }

    // Check role-based config
    const config = configs.find(c => c.report_key === reportKey);
    if (config) {
      return effectiveRole ? config.download_roles.includes(effectiveRole) : false;
    }

    // Fallback to defaults
    const def = DEFAULT_CONFIGS[reportKey];
    return def && effectiveRole ? def.download_roles.includes(effectiveRole) : false;
  };

  const updateAccessMutation = useMutation({
    mutationFn: async ({ reportKey, viewRoles, downloadRoles }: { reportKey: string; viewRoles: AppRole[]; downloadRoles: AppRole[] }) => {
      const { error } = await supabase
        .from('report_access_config')
        .update({ view_roles: viewRoles as any, download_roles: downloadRoles as any, updated_at: new Date().toISOString() })
        .eq('report_key', reportKey);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['report-access-config'] }),
  });

  const grantUserAccessMutation = useMutation({
    mutationFn: async ({ reportKey, userId, canView, canDownload }: { reportKey: string; userId: string; canView: boolean; canDownload: boolean }) => {
      const { error } = await supabase
        .from('report_access_user_overrides')
        .upsert({
          report_key: reportKey,
          user_id: userId,
          can_view: canView,
          can_download: canDownload,
          granted_by: user?.id,
        }, { onConflict: 'report_key,user_id' });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['report-access-user-overrides'] }),
  });

  const revokeUserAccessMutation = useMutation({
    mutationFn: async ({ reportKey, userId }: { reportKey: string; userId: string }) => {
      const { error } = await supabase
        .from('report_access_user_overrides')
        .delete()
        .eq('report_key', reportKey)
        .eq('user_id', userId);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['report-access-user-overrides'] }),
  });

  return {
    configs,
    userOverrides,
    isLoading: configsLoading || overridesLoading,
    canView,
    canDownload,
    updateAccess: updateAccessMutation,
    grantUserAccess: grantUserAccessMutation,
    revokeUserAccess: revokeUserAccessMutation,
  };
}

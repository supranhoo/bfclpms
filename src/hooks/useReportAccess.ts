import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import type { AppRole } from '@/lib/roles';
import {
  DEFAULT_REPORT_ACCESS,
  buildMappableReports,
  type MappableReport,
} from '@/lib/reports/accessCatalog';

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

// Defaults live in the report access catalogue (SSOT).
const DEFAULT_CONFIGS = DEFAULT_REPORT_ACCESS;

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

  // Registry is the catalogue of reports that EXIST — config only holds saved
  // role mappings. Report Access must show the union of both.
  const { data: registry = [] } = useQuery({
    queryKey: ['report-registry-active'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('report_registry')
        .select('report_key, display_name, is_active')
        .eq('is_active', true)
        .order('display_name');
      if (error) throw error;
      return (data || []) as Array<{ report_key: string; display_name: string; is_active: boolean }>;
    },
    staleTime: 5 * 60 * 1000,
  });

  const mappableReports: MappableReport[] = buildMappableReports(registry, configs);

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
    mutationFn: async ({ reportKey, reportName, viewRoles, downloadRoles }: { reportKey: string; reportName?: string; viewRoles: AppRole[]; downloadRoles: AppRole[] }) => {
      // Upsert (not update) so reports that have no config row yet — i.e. newly
      // shipped reports listed from `report_registry` — can be mapped.
      const { error } = await supabase
        .from('report_access_config')
        .upsert({
          report_key: reportKey,
          report_name: reportName ?? reportKey,
          view_roles: viewRoles as any,
          download_roles: downloadRoles as any,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'report_key' });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['report-access-config'] });
      queryClient.invalidateQueries({ queryKey: ['report-registry-active'] });
    },
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
    registry,
    mappableReports,
    userOverrides,
    isLoading: configsLoading || overridesLoading,
    canView,
    canDownload,
    updateAccess: updateAccessMutation,
    grantUserAccess: grantUserAccessMutation,
    revokeUserAccess: revokeUserAccessMutation,
  };
}

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import type { AppRole } from '@/lib/roles';

export interface MenuAccessConfig {
  id: string;
  menu_key: string;
  menu_name: string;
  section: string;
  allowed_roles: AppRole[];
  display_order: number;
  created_at: string;
  updated_at: string;
}

// Hardcoded fallback matching AppSidebar defaults
const DEFAULT_MENU_ROLES: Record<string, AppRole[]> = {
  'dashboard': ['admin', 'manager', 'employee', 'auditor', 'management', 'hr_pms', 'skip_level'],
  'inbox': ['employee', 'manager', 'admin', 'auditor', 'management', 'hr_pms', 'skip_level'],
  'pms-policy': ['admin', 'manager', 'employee', 'auditor', 'management', 'hr_pms'],
  'team-reviews': ['manager', 'admin', 'management', 'skip_level'],
  'hr-pms-review': ['hr_pms', 'admin'],
  'management-dashboard': ['management', 'admin'],
  'management-review': ['management', 'admin'],
  'audit-panel': ['auditor', 'admin'],
  'admin-settings': ['admin'],
};

export function useMenuAccess() {
  const { user, effectiveRole } = useAuth();
  const queryClient = useQueryClient();

  const { data: configs = [], isLoading } = useQuery({
    queryKey: ['menu-access-config'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('menu_access_config')
        .select('*')
        .order('display_order');
      if (error) throw error;
      return (data || []) as MenuAccessConfig[];
    },
    staleTime: 5 * 60 * 1000,
  });

  const configMap = new Map(configs.map(c => [c.menu_key, c]));

  const canAccess = (menuKey: string): boolean => {
    if (!effectiveRole) return false;
    // Safety: admin always has System Settings access
    if (menuKey === 'admin-settings' && effectiveRole === 'admin') return true;

    const config = configMap.get(menuKey);
    if (config) {
      return config.allowed_roles.includes(effectiveRole);
    }
    // Fallback to hardcoded defaults
    const fallback = DEFAULT_MENU_ROLES[menuKey];
    if (fallback) return fallback.includes(effectiveRole);
    // If no config and no fallback, only admin
    return effectiveRole === 'admin';
  };

  const getMenuRoles = (menuKey: string): AppRole[] => {
    const config = configMap.get(menuKey);
    return config?.allowed_roles || DEFAULT_MENU_ROLES[menuKey] || [];
  };

  const updateMenuAccess = useMutation({
    mutationFn: async ({ menuKey, allowedRoles }: { menuKey: string; allowedRoles: AppRole[] }) => {
      const { error } = await supabase
        .from('menu_access_config')
        .update({ allowed_roles: allowedRoles, updated_at: new Date().toISOString() })
        .eq('menu_key', menuKey);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['menu-access-config'] });
    },
  });

  return { configs, isLoading, canAccess, getMenuRoles, updateMenuAccess };
}

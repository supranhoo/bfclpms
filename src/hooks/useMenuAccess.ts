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

export interface MenuAccessUserOverride {
  id: string;
  menu_key: string;
  user_id: string;
  granted_by: string | null;
  created_at: string;
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

  const { data: userOverrides = [], isLoading: overridesLoading } = useQuery({
    queryKey: ['menu-access-user-overrides'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('menu_access_user_overrides')
        .select('*');
      if (error) throw error;
      return (data || []) as MenuAccessUserOverride[];
    },
    staleTime: 5 * 60 * 1000,
  });

  const configMap = new Map(configs.map(c => [c.menu_key, c]));

  const canAccess = (menuKey: string): boolean => {
    if (!effectiveRole && !user) return false;
    // Safety: admin always has System Settings access
    if (menuKey === 'admin-settings' && effectiveRole === 'admin') return true;

    // Check user-level override first
    if (user) {
      const hasOverride = userOverrides.some(o => o.menu_key === menuKey && o.user_id === user.id);
      if (hasOverride) return true;
    }

    // Fall back to role-based config
    if (!effectiveRole) return false;
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

  const grantUserMenuAccess = useMutation({
    mutationFn: async ({ menuKey, userId }: { menuKey: string; userId: string }) => {
      const { error } = await supabase
        .from('menu_access_user_overrides')
        .upsert({
          menu_key: menuKey,
          user_id: userId,
          granted_by: user?.id,
        }, { onConflict: 'menu_key,user_id' });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['menu-access-user-overrides'] });
    },
  });

  const revokeUserMenuAccess = useMutation({
    mutationFn: async ({ menuKey, userId }: { menuKey: string; userId: string }) => {
      const { error } = await supabase
        .from('menu_access_user_overrides')
        .delete()
        .eq('menu_key', menuKey)
        .eq('user_id', userId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['menu-access-user-overrides'] });
    },
  });

  return {
    configs,
    userOverrides,
    isLoading: isLoading || overridesLoading,
    canAccess,
    getMenuRoles,
    updateMenuAccess,
    grantUserMenuAccess,
    revokeUserMenuAccess,
  };
}

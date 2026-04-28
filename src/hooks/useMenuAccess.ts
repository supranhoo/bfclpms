import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useAppSettings } from '@/hooks/useAppSettings';
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

export interface ProfileMenuRight {
  menu_key: string;
  can_view: boolean;
  can_add: boolean;
  can_update: boolean;
  can_delete: boolean;
}

// Hardcoded fallback matching AppSidebar defaults.
// NOTE: 'pms-policy' intentionally omitted — see BUG-042. Visibility is
// driven exclusively by `app_settings.pms_policy_visible_roles` via the
// dedicated branch in canAccess() below.
const DEFAULT_MENU_ROLES: Record<string, AppRole[]> = {
  'dashboard': ['admin', 'manager', 'employee', 'auditor', 'management', 'hr_pms', 'skip_level'],
  'inbox': ['employee', 'manager', 'admin', 'auditor', 'management', 'hr_pms', 'skip_level'],
  'team-reviews': ['manager', 'admin', 'management', 'skip_level'],
  'hr-pms-review': ['hr_pms', 'admin'],
  'management-dashboard': ['management', 'admin'],
  'management-review': ['management', 'admin'],
  'audit-panel': ['auditor', 'admin'],
  'admin-settings': ['admin'],
};

// Layer 1: Implicit default menus every employee can always view.
// NOTE: 'pms-policy' intentionally omitted — see BUG-042.
const EMPLOYEE_DEFAULT_MENUS = ['dashboard', 'inbox'];

// Layer 1: Implicit default menus for reporting managers
const MANAGER_DEFAULT_MENUS = ['team-reviews'];

export function useMenuAccess() {
  const { user, effectiveRole, profile } = useAuth();
  const queryClient = useQueryClient();
  const { data: appSettings } = useAppSettings();

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

  // Fetch profile-based menu rights for the current user
  const { data: profileRights = [], isLoading: profileRightsLoading } = useQuery({
    queryKey: ['user-profile-menu-rights', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await supabase
        .rpc('get_user_access_profile_rights', { p_user_id: user.id });
      if (error) {
        console.warn('Failed to fetch profile rights:', error);
        return [];
      }
      return (data || []) as ProfileMenuRight[];
    },
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000,
  });

  // Check if current user has direct reports (for manager default menus)
  const { data: hasDirectReports = false } = useQuery({
    queryKey: ['has-direct-reports', user?.id],
    queryFn: async () => {
      if (!user?.id) return false;
      const { count, error } = await supabase
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .eq('reporting_manager_id', user.id)
        .eq('is_active', true)
        .limit(1);
      if (error) return false;
      return (count || 0) > 0;
    },
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000,
  });

  const configMap = new Map(configs.map(c => [c.menu_key, c]));
  const profileRightsMap = new Map(profileRights.map(r => [r.menu_key, r]));

  const canAccess = (menuKey: string): boolean => {
    if (!effectiveRole && !user) return false;

    // Priority 1: Admin always has System Settings access
    if (menuKey === 'admin-settings' && effectiveRole === 'admin') return true;

    // Priority 1b (BUG-042): PMS Policy visibility is canonically driven by
    // `app_settings.pms_policy_visible_roles`. Admin always sees it; everyone
    // else only when their effective role is in the configured list. Per-user
    // overrides below still grant access (intentional escape hatch).
    if (menuKey === 'pms-policy') {
      if (effectiveRole === 'admin') return true;
      if (!effectiveRole) return false;
      const visible =
        appSettings?.pms_policy_visible_roles ??
        ['admin', 'manager', 'employee', 'auditor', 'management', 'hr_pms'];
      if (visible.includes(effectiveRole)) return true;
      // Fall through to user-override check (Priority 5) — do NOT short-circuit
      // false here, otherwise admin-granted overrides would be ignored.
      if (user) {
        const hasOverride = userOverrides.some(
          o => o.menu_key === 'pms-policy' && o.user_id === user.id,
        );
        if (hasOverride) return true;
      }
      return false;
    }

    // Priority 2: Employee implicit defaults (Layer 1)
    if (user && EMPLOYEE_DEFAULT_MENUS.includes(menuKey)) return true;

    // Priority 3: Manager implicit defaults (Layer 1)
    if (user && MANAGER_DEFAULT_MENUS.includes(menuKey) && hasDirectReports) return true;

    // Priority 4: Profile-based access (Layer 2)
    const profileRight = profileRightsMap.get(menuKey);
    if (profileRight?.can_view) return true;

    // Priority 5: User-level override
    if (user) {
      const hasOverride = userOverrides.some(o => o.menu_key === menuKey && o.user_id === user.id);
      if (hasOverride) return true;
    }

    // Priority 6: Role-based config
    if (!effectiveRole) return false;
    const config = configMap.get(menuKey);
    if (config) {
      return config.allowed_roles.includes(effectiveRole);
    }

    // Priority 7: Hardcoded fallback
    const fallback = DEFAULT_MENU_ROLES[menuKey];
    if (fallback) return fallback.includes(effectiveRole);

    return effectiveRole === 'admin';
  };

  /** Granular CRUD check: does the user have a specific action right via profile? */
  const canPerform = (menuKey: string, action: 'view' | 'add' | 'update' | 'delete'): boolean => {
    // Admin can do everything
    if (effectiveRole === 'admin') return true;

    // Check profile-based rights
    const right = profileRightsMap.get(menuKey);
    if (right) {
      switch (action) {
        case 'view': return right.can_view;
        case 'add': return right.can_add;
        case 'update': return right.can_update;
        case 'delete': return right.can_delete;
      }
    }

    // Fallback: if user has role-based or override access, they can view
    if (action === 'view') return canAccess(menuKey);

    return false;
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
    isLoading: isLoading || overridesLoading || profileRightsLoading,
    canAccess,
    canPerform,
    getMenuRoles,
    updateMenuAccess,
    grantUserMenuAccess,
    revokeUserMenuAccess,
  };
}

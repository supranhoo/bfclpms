import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Returns the set of employee IDs the current user is allowed to see in
 * scope-aware admin screens (e.g. User Management), based on the Org Level
 * Scope mapped to their access profile(s).
 *
 * - Admin / no auth-ready: `visibleIds === null` ⇒ caller should NOT filter
 *   (admin sees everything; pre-auth state defers to existing route gating).
 * - Non-admin: `visibleIds` is a Set<string> (possibly empty) of profile IDs
 *   that satisfy at least one access-profile scope row mapped to the viewer.
 *
 * See POLICY §NEW (Access-Profile Org-Scope Visibility).
 */
export function useMyVisibleEmployeeIds() {
  const { user, effectiveRole, isReady } = useAuth();
  const isAdmin = effectiveRole === 'admin';

  const query = useQuery({
    queryKey: ['my-visible-employee-ids', user?.id, isAdmin],
    queryFn: async (): Promise<string[]> => {
      if (!user?.id) return [];
      const { data, error } = await supabase.rpc('get_visible_employee_ids', {
        p_user_id: user.id,
      });
      if (error) throw error;
      return (data ?? []).map((r: { employee_id: string }) => r.employee_id);
    },
    enabled: isReady && !!user?.id && !isAdmin,
    staleTime: 5 * 60 * 1000,
  });

  return {
    isAdmin,
    isLoading: !isAdmin && query.isLoading,
    visibleIds: isAdmin ? null : new Set(query.data ?? []),
  };
}

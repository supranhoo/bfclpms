import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { fetchAllRpcPaged } from '@/lib/fetchAll';

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
      // User Management requires inactive employees to be counted/filtered too,
      // so we use the User-Management-specific helper which preserves Org Level
      // Scope but does NOT drop is_active=false rows.
      //
      // POLICY §125 — PostgREST hard-caps RPC responses at 1000 rows
      // server-side (silent 206). Avinash 101732 / Onboarding profile owns
      // 2,571 visible employees; an unpaged call dropped >60% of the
      // roster (employee 102028 included). Always page this RPC.
      const rows = await fetchAllRpcPaged<{ employee_id: string }>((from, to) =>
        (supabase as any)
          .rpc('get_user_management_visible_employee_ids', { p_user_id: user.id })
          .range(from, to),
      );
      return rows.map((r) => r.employee_id);
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

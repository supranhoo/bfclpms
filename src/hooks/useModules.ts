import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';

export interface Module {
  id: string;
  code: string;
  name: string;
  description: string | null;
  icon: string;
  color: string;
  route: string;
  is_enabled: boolean;
  display_order: number;
  created_at: string;
}

export function useModules() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Realtime: when admin grants/revokes Safety access for the current user,
  // refetch so the Hub card appears/disappears within one tick.
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`modules-access-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'safety_module_access',
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['modules'] });
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'iac_user_role_assignments',
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['modules'] });
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'safety_user_roles',
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['modules'] });
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, queryClient]);

  return useQuery({
    queryKey: ['modules', user?.id ?? 'anon'],
    queryFn: async (): Promise<Module[]> => {
      // 1. Fetch globally enabled modules.
      const { data: enabled, error } = await supabase
        .from('modules')
        .select('*')
        .eq('is_enabled', true)
        .order('display_order', { ascending: true });

      if (error) {
        console.error('Error fetching modules:', error);
        throw error;
      }

      const all = (enabled || []) as Module[];
      if (all.length === 0 || !user) return all;

      // 2. Filter Safety by per-user grant. PMS admins are auto-granted via
      //    the has_safety_module_access RPC, so we ask the DB directly.
      const safetyIdx = all.findIndex((m) => m.code === 'safety');
      if (safetyIdx === -1) return all;

      const { data: hasAccess, error: accessErr } = await supabase.rpc(
        'has_safety_module_access',
        { _user_id: user.id }
      );
      if (accessErr) {
        console.error('Error checking safety access:', accessErr);
        // Fail closed: hide Safety on access-check error.
        return all.filter((m) => m.code !== 'safety');
      }

      return hasAccess ? all : all.filter((m) => m.code !== 'safety');
    },
    enabled: !!user, // Only fetch when authenticated to avoid RLS empty-result caching
    staleTime: 1000 * 60 * 5, // Cache for 5 minutes
  });
}

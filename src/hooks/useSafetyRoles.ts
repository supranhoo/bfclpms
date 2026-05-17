import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import type { SafetyAppRole } from '@/lib/safetyRoles';

export interface SafetyUserRole {
  id: string;
  user_id: string;
  role: SafetyAppRole;
  business_unit_id: string | null;
  department_id: string | null;
  assigned_by: string | null;
  assigned_at: string;
}

/** All Safety role rows visible to the current user (RLS gates this). */
export function useAllSafetyUserRoles() {
  return useQuery({
    queryKey: ['safety', 'user-roles', 'all'],
    queryFn: async (): Promise<SafetyUserRole[]> => {
      const { data, error } = await supabase
        .from('safety_user_roles')
        .select('id, user_id, role, business_unit_id, department_id, assigned_by, assigned_at')
        .order('assigned_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as SafetyUserRole[];
    },
    staleTime: 60_000,
  });
}

/** Current user's own Safety roles — used for sidebar/route guards. */
export function useMySafetyRoles() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['safety', 'user-roles', 'me', user?.id ?? 'anon'],
    enabled: !!user,
    queryFn: async (): Promise<SafetyAppRole[]> => {
      const { data, error } = await supabase
        .from('safety_user_roles')
        .select('role')
        .eq('user_id', user!.id);
      if (error) throw error;
      return (data ?? []).map((r) => r.role as SafetyAppRole);
    },
    staleTime: 60_000,
  });
}

export function useGrantSafetyRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      user_id: string;
      role: SafetyAppRole;
      business_unit_id?: string | null;
      department_id?: string | null;
    }): Promise<{ auth_action: 'created' | 'existing' }> => {
      const { data, error } = await supabase.functions.invoke('grant-safety-role', {
        body: {
          user_id: input.user_id,
          role: input.role,
          business_unit_id: input.business_unit_id ?? null,
          department_id: input.department_id ?? null,
        },
      });
      if (error) {
        // Edge function returns JSON error body; surface its message if present
        const msg = (data as any)?.error || error.message;
        throw new Error(msg);
      }
      if ((data as any)?.error) throw new Error((data as any).error);
      return { auth_action: (data as any)?.auth_action ?? 'existing' };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['safety', 'user-roles'] });
      qc.invalidateQueries({ queryKey: ['modules'] });
    },
  });
}

export function useRevokeSafetyRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('safety_user_roles').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['safety', 'user-roles'] });
      qc.invalidateQueries({ queryKey: ['modules'] });
    },
  });
}

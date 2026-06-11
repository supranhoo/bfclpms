import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface SafetyRoutingRule {
  id: string;
  business_unit_id: string;
  department_id: string | null;
  bu_head_id: string;
  manager_id: string;
  second_manager_id: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
}

const KEY = ['safety', 'incident_routing_rules'] as const;

export function useSafetyRoutingRules() {
  return useQuery({
    queryKey: KEY,
    queryFn: async (): Promise<SafetyRoutingRule[]> => {
      const { data, error } = await supabase
        .from('safety_incident_routing_rules' as never)
        .select('*')
        .order('updated_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as SafetyRoutingRule[];
    },
  });
}

export interface UpsertRuleInput {
  id?: string;
  business_unit_id: string;
  department_id: string | null;
  bu_head_id: string;
  manager_id: string;
  second_manager_id: string;
  is_active: boolean;
}

export function useUpsertSafetyRoutingRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: UpsertRuleInput) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');
      if (!input.bu_head_id || !input.manager_id || !input.second_manager_id) {
        throw new Error('BU Head, Manager and 2nd Manager are all required.');
      }
      const payload = {
        business_unit_id: input.business_unit_id,
        department_id: input.department_id,
        bu_head_id: input.bu_head_id,
        manager_id: input.manager_id,
        second_manager_id: input.second_manager_id,
        is_active: input.is_active,
        updated_by: user.id,
      };
      if (input.id) {
        const { error } = await supabase
          .from('safety_incident_routing_rules' as never)
          .update(payload as never)
          .eq('id', input.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('safety_incident_routing_rules' as never)
          .insert({ ...payload, created_by: user.id } as never);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY });
      toast.success('Routing rule saved');
    },
    onError: (e: unknown) => {
      const msg = (e as Error).message ?? 'Failed to save rule';
      if (/duplicate key|unique/i.test(msg)) {
        toast.error('An active rule already exists for this scope. Deactivate it first.');
      } else {
        toast.error(msg);
      }
    },
  });
}

export function useDeleteSafetyRoutingRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('safety_incident_routing_rules' as never)
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY });
      toast.success('Rule deleted');
    },
    onError: (e: unknown) => toast.error((e as Error).message ?? 'Failed to delete'),
  });
}
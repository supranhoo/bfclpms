import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * useSafetyMasterData
 * -------------------
 * Categorized reference data for the Safety module (root causes, PPE types,
 * hazard classes, etc.). Read is open to any authenticated module user;
 * mutations are gated server-side by RLS (admin / safety_head only).
 */

export interface SafetyMasterDataRow {
  id: string;
  category: string;
  code: string;
  label: string;
  parent_id: string | null;
  sort_order: number;
  is_active: boolean;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

const KEY = ['safety', 'master-data'] as const;

export function useSafetyMasterData(category?: string) {
  return useQuery<SafetyMasterDataRow[]>({
    queryKey: [...KEY, category ?? 'all'],
    queryFn: async () => {
      let q = supabase
        .from('safety_master_data' as never)
        .select('*')
        .order('category', { ascending: true })
        .order('sort_order', { ascending: true })
        .order('label', { ascending: true });
      if (category) q = q.eq('category', category);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as SafetyMasterDataRow[];
    },
    staleTime: 60_000,
  });
}

export function useUpsertSafetyMasterData() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<SafetyMasterDataRow> & {
      category: string;
      code: string;
      label: string;
    }) => {
      const { error } = await supabase
        .from('safety_master_data' as never)
        .upsert(input as never, { onConflict: 'category,code' });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useDeleteSafetyMasterData() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('safety_master_data' as never)
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export function useIncentiveSlabCategories() {
  return useQuery({
    queryKey: ['incentive-slab-categories'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('incentive_slab_categories')
        .select('*')
        .order('sort_order');
      if (error) throw error;
      return data || [];
    },
  });
}

export function useCreateSlabCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ value, label }: { value: string; label: string }) => {
      const { data: existing } = await supabase
        .from('incentive_slab_categories')
        .select('sort_order')
        .order('sort_order', { ascending: false })
        .limit(1);
      const nextOrder = (existing?.[0]?.sort_order ?? 0) + 1;
      const { error } = await supabase
        .from('incentive_slab_categories')
        .insert({ value, label, sort_order: nextOrder });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['incentive-slab-categories'] });
      toast.success('Slab category added');
    },
    onError: (e: any) => toast.error(e.message || 'Failed to add category'),
  });
}

export function useDeleteSlabCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('incentive_slab_categories')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['incentive-slab-categories'] });
      toast.success('Slab category removed');
    },
    onError: (e: any) => toast.error(e.message || 'Failed to remove category'),
  });
}

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export function useIncentiveProgramTypes() {
  return useQuery({
    queryKey: ['incentive-program-types'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('incentive_program_types')
        .select('*')
        .order('label');
      if (error) throw error;
      return data || [];
    },
  });
}

export function useCreateProgramType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ value, label }: { value: string; label: string }) => {
      const { error } = await supabase
        .from('incentive_program_types')
        .insert({ value, label });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['incentive-program-types'] });
      toast.success('Program type added');
    },
    onError: (e: any) => toast.error(e.message || 'Failed to add type'),
  });
}

export function useDeleteProgramType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('incentive_program_types')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['incentive-program-types'] });
      toast.success('Program type removed');
    },
    onError: (e: any) => toast.error(e.message || 'Failed to remove type'),
  });
}

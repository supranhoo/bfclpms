import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export function useDivisions() {
  return useQuery({
    queryKey: ['divisions'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('divisions')
        .select('*')
        .order('name');

      if (error) throw error;
      return data;
    },
  });
}

export function useBusinessUnits() {
  return useQuery({
    queryKey: ['business-units'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('business_units')
        .select(`
          *,
          divisions (id, name, code)
        `)
        .order('name');

      if (error) throw error;
      return data;
    },
  });
}

export function useDepartments() {
  return useQuery({
    queryKey: ['departments'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('departments')
        .select(`
          *,
          business_units (id, name, code, divisions (id, name, code))
        `)
        .order('name');

      if (error) throw error;
      return data;
    },
  });
}

export function useSubBranches() {
  return useQuery({
    queryKey: ['sub-branches'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sub_branches')
        .select(`
          *,
          departments (id, name, code)
        `)
        .order('name');

      if (error) throw error;
      return data;
    },
  });
}

export function useKraCategories() {
  return useQuery({
    queryKey: ['kra-categories'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('kra_categories')
        .select('*')
        .order('name');

      if (error) throw error;
      return data;
    },
  });
}

export function useCreateKraCategory() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (category: { name: string; weightage: number; color: string; description?: string }) => {
      const { data, error } = await supabase
        .from('kra_categories')
        .insert(category)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kra-categories'] });
      toast({ title: 'Category created successfully' });
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to create category', description: error.message, variant: 'destructive' });
    },
  });
}

export function useProfiles() {
  return useQuery({
    queryKey: ['profiles'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select(`
          *,
          departments (id, name, code),
          user_roles (role)
        `)
        .order('full_name');

      if (error) throw error;
      return data;
    },
  });
}

export function useTeamMembers(managerId: string | undefined) {
  return useQuery({
    queryKey: ['team-members', managerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select(`
          *,
          departments (id, name, code)
        `)
        .eq('reporting_manager_id', managerId)
        .order('full_name');

      if (error) throw error;
      return data;
    },
    enabled: !!managerId,
  });
}

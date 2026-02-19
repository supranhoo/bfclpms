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

export function useDesignations() {
  return useQuery({
    queryKey: ['designations'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('designations')
        .select('*')
        .order('name');

      if (error) throw error;
      return data;
    },
  });
}

export function usePmsGrades() {
  return useQuery({
    queryKey: ['pms-grades'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('pms_grades')
        .select('*')
        .order('name');

      if (error) throw error;
      return data;
    },
  });
}

export function useLevels() {
  return useQuery({
    queryKey: ['levels'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('levels' as any)
        .select('*')
        .order('name');

      if (error) throw error;
      return data as any[];
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
    mutationFn: async (category: { name: string; weightage: number; color: string; description?: string; is_org_level?: boolean; org_scoring_mode?: string | null }) => {
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
      queryClient.invalidateQueries({ queryKey: ['org-level-categories'] });
      toast({ title: 'Category created successfully' });
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to create category', description: error.message, variant: 'destructive' });
    },
  });
}

export function useUpdateKraCategory() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, ...category }: { id: string; name: string; weightage: number; color: string; description?: string; is_org_level?: boolean; org_scoring_mode?: string | null }) => {
      const { data, error } = await supabase
        .from('kra_categories')
        .update(category)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kra-categories'] });
      queryClient.invalidateQueries({ queryKey: ['org-level-categories'] });
      toast({ title: 'Category updated successfully' });
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to update category', description: error.message, variant: 'destructive' });
    },
  });
}

export function useDeleteKraCategory() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('kra_categories')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kra-categories'] });
      toast({ title: 'Category deleted successfully' });
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to delete category', description: error.message, variant: 'destructive' });
    },
  });
}

export function useProfiles() {
  return useQuery({
    queryKey: ['profiles'],
    queryFn: async () => {
      // Fetch profiles with departments (mobile_number included via *)
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select(`
          *,
          departments (id, name, code)
        `)
        .order('full_name');

      if (profilesError) throw profilesError;

      // Fetch all user roles separately (no FK relationship)
      const { data: roles, error: rolesError } = await supabase
        .from('user_roles')
        .select('user_id, role');

      if (rolesError) throw rolesError;

      // Merge roles into profiles
      const profilesWithRoles = profiles?.map(profile => ({
        ...profile,
        user_roles: roles?.filter(r => r.user_id === profile.id) || []
      }));

      return profilesWithRoles;
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
        .eq('reporting_manager_id', managerId!)
        .order('full_name');

      if (error) throw error;
      return data;
    },
    enabled: !!managerId,
  });
}

/**
 * Fetch skip-level subordinates: employees whose reporting manager reports to the given user.
 * i.e. SELECT p.* FROM profiles p JOIN profiles rm ON p.reporting_manager_id = rm.id WHERE rm.reporting_manager_id = :userId
 */
/**
 * Fetch profiles whose resolved workflow template includes the given stage.
 * Respects the employee-level override (workflow_config) with fallback to the default template.
 * Returns null when stage is null (meaning "no filter needed").
 */
export function useProfilesByWorkflowStage(stage: string | null) {
  return useQuery({
    queryKey: ['profiles-by-workflow-stage', stage],
    queryFn: async () => {
      if (!stage) return null;

      // 1. Fetch all employee-level overrides with their template stages
      const { data: overrideConfigs } = await supabase
        .from('workflow_config')
        .select('config_value, workflow_templates!inner(stages)')
        .eq('config_type', 'employee');

      // 2. Get the system default template stages
      const { data: defaultTemplate } = await supabase
        .from('workflow_templates')
        .select('stages')
        .eq('is_default', true)
        .maybeSingle();

      const defaultStages: string[] = (defaultTemplate?.stages as string[]) || [];
      const defaultHasStage = defaultStages.includes(stage);

      // 3. Build employee-id → hasStage map from overrides
      const overrideMap = new Map<string, boolean>();
      overrideConfigs?.forEach(cfg => {
        const stages = (cfg.workflow_templates as any)?.stages as string[] || [];
        overrideMap.set(cfg.config_value, stages.includes(stage));
      });

      // 4. Fetch all profiles
      const { data: profiles, error } = await supabase
        .from('profiles')
        .select('*, departments(id, name, code)')
        .order('full_name');

      if (error) throw error;

      // 5. Filter: use override if present, otherwise fall back to system default
      return profiles?.filter(p => {
        if (overrideMap.has(p.id)) return overrideMap.get(p.id);
        return defaultHasStage;
      }) || [];
    },
    enabled: !!stage,
  });
}

export function useSkipLevelTeamMembers(userId: string | undefined) {
  return useQuery({
    queryKey: ['skip-level-team-members', userId],
    queryFn: async () => {
      // Step 1: Get direct reports of the current user
      const { data: directReports, error: drError } = await supabase
        .from('profiles')
        .select('id')
        .eq('reporting_manager_id', userId!);

      if (drError) throw drError;
      if (!directReports || directReports.length === 0) return [];

      const directReportIds = directReports.map(d => d.id);

      // Step 2: Get employees who report to the direct reports
      const { data, error } = await supabase
        .from('profiles')
        .select(`
          *,
          departments (id, name, code)
        `)
        .in('reporting_manager_id', directReportIds)
        .order('full_name');

      if (error) throw error;
      return data || [];
    },
    enabled: !!userId,
  });
}

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { fetchAllPaged } from '@/lib/fetchAll';

export function useDivisions(companyId?: string) {
  return useQuery({
    queryKey: ['divisions', companyId],
    queryFn: async () => {
      let query = supabase
        .from('divisions')
        .select('*')
        .order('name');

      if (companyId) {
        query = query.eq('company_id', companyId);
      }

      const { data, error } = await query;
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

export function useDesignations(companyId?: string) {
  return useQuery({
    queryKey: ['designations', companyId],
    queryFn: async () => {
      let query = supabase
        .from('designations')
        .select('*')
        .order('name');

      if (companyId) {
        query = query.eq('company_id', companyId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });
}

export function usePmsGrades(companyId?: string) {
  return useQuery({
    queryKey: ['pms-grades', companyId],
    queryFn: async () => {
      let query = supabase
        .from('pms_grades')
        .select('*')
        .order('name');

      if (companyId) {
        query = query.eq('company_id', companyId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });
}

export function useLevels(companyId?: string) {
  return useQuery({
    queryKey: ['levels', companyId],
    queryFn: async () => {
      let query = supabase
        .from('levels' as any)
        .select('*')
        .order('name');

      if (companyId) {
        query = query.eq('company_id', companyId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as any[];
    },
  });
}

export function useLocations(companyId?: string) {
  return useQuery({
    queryKey: ['locations', companyId],
    queryFn: async () => {
      let query = supabase
        .from('locations' as any)
        .select('*')
        .eq('is_active', true)
        .order('name');

      if (companyId) {
        query = query.eq('company_id', companyId);
      }

      const { data, error } = await query;
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
      // Fetch ALL profiles in 1000-row pages to bypass PostgREST's default row cap.
      // Without paging, the dataset silently truncates at 1000 rows even though the
      // DB may have many more (e.g. after bulk imports).
      const profiles = await fetchAllPaged<any>((from, to) =>
        supabase
          .from('profiles')
          .select(`*, departments (id, name, code)`)
          .eq('is_active', true)
          .order('full_name')
          .range(from, to)
      );

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
        .eq('is_active', true)
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
export function useProfilesByWorkflowStage(stage: string | null, reviewPeriod?: string, reviewYear?: number) {
  return useQuery({
    queryKey: ['profiles-by-workflow-stage', stage, reviewPeriod, reviewYear],
    queryFn: async () => {
      if (!stage) return null;

      // 1. Fetch all profiles (paged to bypass PostgREST 1000-row cap)
      const profiles = await fetchAllPaged<any>((from, to) =>
        supabase
          .from('profiles')
          .select('*, departments(id, name, code)')
          .eq('is_active', true)
          .order('full_name')
          .range(from, to)
      );

      if (!profiles || profiles.length === 0) return [];

      // 2. Use get_bulk_employee_workflows RPC which handles the FULL cascade:
      //    employee-level override → department-level → pms_grade-level → default template
      //    This is the authoritative resolution, identical to what useEmployeeWorkflowStages uses.
      const profileIds = profiles.map(p => p.id);
      const rpcParams: Record<string, any> = { employee_ids: profileIds };
      if (reviewPeriod) rpcParams.p_review_period = reviewPeriod;
      if (reviewYear) rpcParams.p_review_year = reviewYear;
      const { data: bulkData, error: bulkError } = await (supabase as any)
        .rpc('get_bulk_employee_workflows', rpcParams);

      if (bulkError) {
        console.error('useProfilesByWorkflowStage: bulk workflow fetch failed, falling back to default', bulkError);
        // Graceful fallback: only include employees whose default stages contain the stage
        const { data: defaultTemplate } = await supabase
          .from('workflow_templates')
          .select('stages')
          .eq('is_default', true)
          .maybeSingle();
        const defaultStages: string[] = (defaultTemplate?.stages as string[]) || [];
        return defaultStages.includes(stage) ? profiles : [];
      }

      // 3. Build employee_id → stages map from RPC result
      const stagesMap = new Map<string, string[]>();
      if (bulkData) {
        for (const row of bulkData as { employee_id: string; stages: string[] }[]) {
          stagesMap.set(row.employee_id, row.stages);
        }
      }

      // 4. Filter: include only employees whose EFFECTIVE workflow contains the required stage
      const DEFAULT_STAGES = ['kra_set', 'self_review', 'manager_check', 'audit', 'management_review', 'approved'];
      return profiles.filter(p => {
        const empStages = stagesMap.get(p.id) || DEFAULT_STAGES;
        return empStages.includes(stage);
      });
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
        .eq('reporting_manager_id', userId!)
        .eq('is_active', true);

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
        .eq('is_active', true)
        .order('full_name');

      if (error) throw error;
      return data || [];
    },
    enabled: !!userId,
  });
}

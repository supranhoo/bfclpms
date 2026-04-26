import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
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
    placeholderData: keepPreviousData,
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
        // BUG-036 / POLICY §107 — defense-in-depth: even a corrupt
        // self-reporting loop must never leak the manager into their own
        // direct-reports list.
        .neq('id', managerId!)
        .eq('is_active', true)
        .order('full_name');

      if (error) throw error;
      return data;
    },
    enabled: !!managerId,
    placeholderData: keepPreviousData,
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

      // 2. v2.64.9 — Chunked, resilient bulk workflow resolution.
      // Large orgs (2,000+ employees) produce 90KB+ POST bodies that can fail at proxies.
      // We chunk into 500-ID batches with one retry per chunk.
      const profileIds = profiles.map(p => p.id);
      const CHUNK = 500;
      const chunks: string[][] = [];
      for (let i = 0; i < profileIds.length; i += CHUNK) {
        chunks.push(profileIds.slice(i, i + CHUNK));
      }

      const callChunk = async (ids: string[]) => {
        const params: Record<string, any> = { employee_ids: ids };
        if (reviewPeriod) params.p_review_period = reviewPeriod;
        if (reviewYear) params.p_review_year = reviewYear;
        const first = await (supabase as any).rpc('get_bulk_employee_workflows', params);
        if (!first.error) return first;
        await new Promise(r => setTimeout(r, 200));
        return await (supabase as any).rpc('get_bulk_employee_workflows', params);
      };

      const results = await Promise.all(chunks.map(callChunk));
      const stagesMap = new Map<string, string[]>();
      let failedChunks = 0;
      for (const r of results) {
        if (r.error) { failedChunks++; continue; }
        for (const row of (r.data || []) as { employee_id: string; stages: string[] }[]) {
          stagesMap.set(row.employee_id, row.stages);
        }
      }

      // 3. Resilient fallback union of stages from ALL active templates
      //    (not just is_default=true). Used only for employees missing from RPC.
      let fallbackStages: string[] = ['kra_set', 'self_review', 'manager_check', 'audit', 'management_review', 'approved'];
      if (failedChunks > 0 || stagesMap.size < profileIds.length) {
        try {
          const { data: templates } = await supabase
            .from('workflow_templates')
            .select('stages, is_active')
            .eq('is_active', true);
          if (templates && templates.length) {
            const union = new Set<string>();
            for (const t of templates) for (const s of (t.stages as string[]) || []) union.add(s);
            if (union.size) fallbackStages = Array.from(union);
          }
        } catch (e) {
          console.warn('useProfilesByWorkflowStage: template union fallback failed', e);
        }
      }

      // 4. Stage-presence seed (Fix 4): always include employees with KPIs
      //    actually at the requested stage in the requested period. This guarantees
      //    no silent exclusion when workflow resolution is incomplete.
      const seededIds = new Set<string>();
      if (reviewPeriod && reviewYear) {
        try {
          const seed = await fetchAllPaged<{ employee_id: string }>((from, to) =>
            supabase
              .from('kpis')
              .select('employee_id')
              .eq('status', stage as any)
              .eq('review_period', reviewPeriod)
              .eq('review_year', reviewYear)
              .range(from, to)
          );
          for (const row of seed || []) seededIds.add(row.employee_id);
        } catch (e) {
          console.warn('useProfilesByWorkflowStage: stage-presence seed failed', e);
        }
      }

      // 4b. v2.66.7.24 — Score-signature seed (BUG-022 fix).
      //     Reviewer-stage rosters (HR PMS / Audit / Management) MUST also include
      //     employees whose KPIs have ALREADY been scored at this stage in the
      //     requested period — even if the KPI has since advanced past the stage.
      //     Without this, "HR PMS Reviewed", "Auditor Reviewed", and
      //     "Management Reviewed" stat cards collapse to 0 because the scored
      //     KPIs belong to employees no longer present in the visible roster.
      const STAGE_TO_SCORE_COLUMN: Record<string, string> = {
        hr_pms_review: 'hr_pms_score',
        audit: 'auditor_score',
        management_review: 'management_score',
        manager_check: 'manager_score',
        skip_level_check: 'skip_level_score',
      };
      const scoreSigSeededIds = new Set<string>();
      const scoreColumn = STAGE_TO_SCORE_COLUMN[stage];
      if (scoreColumn && reviewPeriod && reviewYear) {
        try {
          // Fetch KPI ids for the period first (paged), then look up review_submissions
          // rows whose score column is non-null. We cannot join in PostgREST, so we
          // do a two-step fetch keyed off `kpis(review_period, review_year)`.
          const periodKpis = await fetchAllPaged<{ id: string; employee_id: string }>(
            (from, to) =>
              supabase
                .from('kpis')
                .select('id, employee_id')
                .eq('review_period', reviewPeriod)
                .eq('review_year', reviewYear)
                .range(from, to)
          );
          const kpiToEmp = new Map<string, string>();
          for (const k of periodKpis || []) kpiToEmp.set(k.id, k.employee_id);
          const kpiIds = Array.from(kpiToEmp.keys());
          const BATCH = 500;
          for (let i = 0; i < kpiIds.length; i += BATCH) {
            const batch = kpiIds.slice(i, i + BATCH);
            const { data, error } = await supabase
              .from('review_submissions')
              .select(`kpi_id, ${scoreColumn}` as any)
              .in('kpi_id', batch)
              .not(scoreColumn as any, 'is', null);
            if (error) {
              console.warn('useProfilesByWorkflowStage: score-signature seed batch failed', error);
              continue;
            }
            for (const r of ((data || []) as unknown as Array<{ kpi_id: string }>)) {
              const empId = kpiToEmp.get(r.kpi_id);
              if (empId) scoreSigSeededIds.add(empId);
            }
          }
        } catch (e) {
          console.warn('useProfilesByWorkflowStage: score-signature seed failed', e);
        }
      }

      // 5. Filter: include employee if (a) seeded by KPI presence, OR
      //    (b) seeded by completed-stage score signature (v2.66.7.24), OR
      //    (c) resolved workflow contains the stage, OR
      //    (d) RPC failed for them AND fallback union contains the stage.
      const filtered = profiles.filter(p => {
        if (seededIds.has(p.id)) return true;
        if (scoreSigSeededIds.has(p.id)) return true;
        const empStages = stagesMap.get(p.id);
        if (empStages) return empStages.includes(stage);
        return fallbackStages.includes(stage);
      });

      // Diagnostic breadcrumb (admin-visible in console)
      console.info('[useProfilesByWorkflowStage]', {
        stage, reviewPeriod, reviewYear,
        totalProfiles: profiles.length,
        resolvedFromRpc: stagesMap.size,
        seededFromKpis: seededIds.size,
        seededFromScoreSignature: scoreSigSeededIds.size,
        failedChunks,
        included: filtered.length,
      });

      // Attach diagnostic flag for UI use (non-enumerable to keep React-Query cache clean is overkill;
      // we just stash on a __meta property on the array).
      (filtered as any).__meta = {
        totalEligiblePool: profiles.length,
        seededFromKpis: seededIds.size,
        seededFromScoreSignature: scoreSigSeededIds.size,
        fallbackUsed: failedChunks > 0,
      };

      return filtered;
    },
    enabled: !!stage,
    placeholderData: keepPreviousData,
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
        // BUG-036 / POLICY §107 — never include the viewer themselves in
        // their own skip-level team list, even if a reporting cycle exists.
        .neq('id', userId!)
        .eq('is_active', true)
        .order('full_name');

      if (error) throw error;
      return data || [];
    },
    enabled: !!userId,
    placeholderData: keepPreviousData,
  });
}

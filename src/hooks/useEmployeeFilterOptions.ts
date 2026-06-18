import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useDepartments } from '@/hooks/useOrganization';
import { fetchAllPaged } from '@/lib/fetchAll';
import { useProfilesVersion } from '@/hooks/useProfilesVersion';
import { useAuth } from '@/contexts/AuthContext';

interface UseEmployeeFilterOptionsArgs {
  enabledGrades?: boolean;
}

export function useEmployeeFilterOptions(args: UseEmployeeFilterOptionsArgs = {}) {
  const { enabledGrades = false } = args;
  const profilesVersion = useProfilesVersion();
  // Auth-Readiness Query Gate (mem://architecture/auth-readiness-query-gate,
  // ADR-052 / POLICY §96). Without this, cold mounts fire profile reads
  // before Supabase rehydrates the session; RLS then returns 0 rows and the
  // Manager / Designation / Grade pickers cache an empty result.
  const { isReady, user } = useAuth();
  // Fetch departments
  const { data: departments } = useDepartments();

  // Fetch distinct designations from profiles.
  // v2.66.14 (Wave 2 perf): single SECURITY DEFINER RPC replaces the paged
  // 2,500-row scan + JS Set dedupe. Was the #3 slow query (mean 1.65s/page,
  // 9.5M ms cumulative). The RPC does DISTINCT in Postgres using the
  // idx_profiles_active_designation index added in Wave 1.
  const { data: designations } = useQuery({
    queryKey: ['distinct-designations', profilesVersion, user?.id],
    staleTime: 5 * 60_000,
    gcTime: 15 * 60_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .rpc('get_distinct_active_designations');
      if (error) throw error;
      return (data ?? []).map((r: { designation: string }) => r.designation);
    },
    enabled: isReady && !!user,
  });

  // Fetch distinct PMS grades from profiles (same RPC pattern).
  const { data: grades } = useQuery({
    queryKey: ['distinct-grades', profilesVersion, user?.id],
    staleTime: 5 * 60_000,
    gcTime: 15 * 60_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .rpc('get_distinct_active_pms_grades');
      if (error) throw error;
      return (data ?? []).map((r: { pms_grade: string }) => r.pms_grade);
    },
    enabled: enabledGrades && isReady && !!user,
  });

  // Fetch managers (profiles who have direct reports)
  const { data: managers } = useQuery({
    queryKey: ['managers-list', profilesVersion, user?.id],
    staleTime: 5 * 60_000,
    gcTime: 15 * 60_000,
    queryFn: async () => {
      // Paged fetch to bypass PostgREST's 1000-row default cap.
      const data = await fetchAllPaged<any>((from, to) =>
        supabase
          .from('profiles')
          .select('id, full_name, reporting_manager_id, functional_manager_id, employee_code')
          .eq('is_active', true)
          .order('full_name')
          .range(from, to)
      );

      const managerIds = new Set(data?.map(p => p.reporting_manager_id).filter(Boolean));
      return data
        ?.filter(p => managerIds.has(p.id))
        .map(p => ({
          id: p.id,
          name: p.employee_code ? `${p.full_name || 'Unknown'} (${p.employee_code})` : (p.full_name || 'Unknown'),
        })) || [];
    },
    enabled: isReady && !!user,
  });

  // Functional Managers — distinct list of profiles referenced as anyone's
  // functional_manager_id. Mirrors the `managers` shape so the same filter UI
  // pattern can reuse it (Custom Report builder, Reports filters).
  const { data: functionalManagers } = useQuery({
    queryKey: ['functional-managers-list', profilesVersion, user?.id],
    staleTime: 5 * 60_000,
    gcTime: 15 * 60_000,
    queryFn: async () => {
      const data = await fetchAllPaged<any>((from, to) =>
        supabase
          .from('profiles')
          .select('id, full_name, functional_manager_id, employee_code')
          .eq('is_active', true)
          .order('full_name')
          .range(from, to)
      );
      const fmIds = new Set(data?.map(p => (p as any).functional_manager_id).filter(Boolean));
      return data
        ?.filter(p => fmIds.has(p.id))
        .map(p => ({
          id: p.id,
          name: p.employee_code ? `${p.full_name || 'Unknown'} (${p.employee_code})` : (p.full_name || 'Unknown'),
        })) || [];
    },
    enabled: isReady && !!user,
  });

  return {
    departments: departments || [],
    designations: designations || [],
    grades: grades || [],
    managers: managers || [],
    functionalManagers: functionalManagers || [],
  };
}

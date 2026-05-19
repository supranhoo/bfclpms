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

  // Fetch distinct designations from profiles
  const { data: designations } = useQuery({
    queryKey: ['distinct-designations', profilesVersion, user?.id],
    queryFn: async () => {
      // Paged fetch — bypasses PostgREST's 1000-row default cap so distinct
      // designations from rows beyond row 1000 are not silently dropped.
      const data = await fetchAllPaged<{ designation: string | null }>((from, to) =>
        supabase
          .from('profiles')
          .select('designation')
          .eq('is_active', true)
          .not('designation', 'is', null)
          .range(from, to)
      );
      return [...new Set(data.map(p => p.designation))].filter(Boolean).sort() as string[];
    },
    enabled: isReady && !!user,
  });

  // Fetch distinct PMS grades from profiles
  const { data: grades } = useQuery({
    queryKey: ['distinct-grades', profilesVersion, user?.id],
    queryFn: async () => {
      // Paged fetch — bypasses PostgREST's 1000-row default cap.
      const data = await fetchAllPaged<{ pms_grade: string | null }>((from, to) =>
        supabase
          .from('profiles')
          .select('pms_grade')
          .eq('is_active', true)
          .not('pms_grade', 'is', null)
          .range(from, to)
      );
      return [...new Set(data.map(p => p.pms_grade))].filter(Boolean).sort() as string[];
    },
    enabled: enabledGrades && isReady && !!user,
  });

  // Fetch managers (profiles who have direct reports)
  const { data: managers } = useQuery({
    queryKey: ['managers-list', profilesVersion, user?.id],
    queryFn: async () => {
      // Paged fetch to bypass PostgREST's 1000-row default cap.
      const data = await fetchAllPaged<any>((from, to) =>
        supabase
          .from('profiles')
          .select('id, full_name, reporting_manager_id, employee_code')
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

  return {
    departments: departments || [],
    designations: designations || [],
    grades: grades || [],
    managers: managers || [],
  };
}

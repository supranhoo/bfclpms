import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useDepartments } from '@/hooks/useOrganization';

export function useEmployeeFilterOptions() {
  // Fetch departments
  const { data: departments } = useDepartments();

  // Fetch distinct designations from profiles
  const { data: designations } = useQuery({
    queryKey: ['distinct-designations'],
    queryFn: async () => {
      const { data } = await supabase
        .from('profiles')
        .select('designation')
        .eq('is_active', true)
        .not('designation', 'is', null);
      return [...new Set(data?.map(p => p.designation))].filter(Boolean).sort() as string[];
    },
  });

  // Fetch distinct PMS grades from profiles
  const { data: grades } = useQuery({
    queryKey: ['distinct-grades'],
    queryFn: async () => {
      const { data } = await supabase
        .from('profiles')
        .select('pms_grade')
        .not('pms_grade', 'is', null);
      return [...new Set(data?.map(p => p.pms_grade))].filter(Boolean).sort() as string[];
    },
  });

  // Fetch managers (profiles who have direct reports)
  const { data: managers } = useQuery({
    queryKey: ['managers-list'],
    queryFn: async () => {
      const { data } = await supabase
        .from('profiles')
        .select('id, full_name, reporting_manager_id, employee_code')
        .order('full_name');

      const managerIds = new Set(data?.map(p => p.reporting_manager_id).filter(Boolean));
      return data
        ?.filter(p => managerIds.has(p.id))
        .map(p => ({
          id: p.id,
          name: p.employee_code ? `${p.full_name || 'Unknown'} (${p.employee_code})` : (p.full_name || 'Unknown'),
        })) || [];
    },
  });

  return {
    departments: departments || [],
    designations: designations || [],
    grades: grades || [],
    managers: managers || [],
  };
}

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { fetchAllPaged } from '@/lib/fetchAll';
import type { EmployeeOption } from '@/components/admin/EmployeeCombobox';

/**
 * Shared cached fetch of the active employee roster for the "Copy KPI / KRAs to
 * other employees" tools. Uses POLICY §94 paged read to bypass PostgREST's
 * 1000-row cap, and caches the result for 5 minutes so opening the Copy
 * collapsible / dialog repeatedly does not refetch ~2,500 profiles each time.
 */
export function useActiveEmployeesForCopy(
  opts: { enabled?: boolean; includeInactive?: boolean } = {},
) {
  const enabled = opts.enabled ?? true;
  const includeInactive = opts.includeInactive ?? false;
  return useQuery<EmployeeOption[]>({
    queryKey: ['active-employees-for-copy', includeInactive ? 'all' : 'active'],
    enabled,
    staleTime: 5 * 60_000,
    gcTime: 10 * 60_000,
    queryFn: async () => {
      const data = await fetchAllPaged<any>((from, to) => {
        let q = supabase
          .from('profiles')
          .select('id, full_name, employee_code, is_active, departments:department_id(name)')
          .order('full_name')
          .range(from, to);
        if (!includeInactive) q = q.eq('is_active', true);
        return q;
      });
      return (data || []).map((e: any) => ({
        id: e.id,
        name: e.full_name || e.id,
        code: e.employee_code || '',
        department: e.departments?.name || '',
        isActive: e.is_active !== false,
      }));
    },
  });
}
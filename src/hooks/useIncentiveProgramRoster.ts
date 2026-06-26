import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Server-authoritative mapped roster for an incentive program.
 *
 * Backed by the SECURITY DEFINER RPC `get_incentive_program_employees`,
 * which resolves every mapping_type → employee server-side and returns
 * non-PII identification + organisational scope fields (including the
 * pre-resolved `company_id`).
 *
 * This is the SSOT used by report compute scoping, report company
 * filtering, and the data-entry grid so all three paths agree under
 * RLS-restricted profile visibility (Upendra / Sandeep).
 */
export interface IncentiveRosterEntry {
  id: string;
  full_name: string | null;
  employee_code: string | null;
  designation: string | null;
  department_id: string | null;
  business_unit_id: string | null;
  division_id: string | null;
  company_id: string | null;
}

export function useIncentiveProgramRoster(programId?: string) {
  const enabled = !!programId && programId !== 'all';
  return useQuery({
    queryKey: ['incentive-program-roster', programId],
    enabled,
    queryFn: async (): Promise<IncentiveRosterEntry[]> => {
      const { data, error } = await supabase.rpc('get_incentive_program_employees', {
        _program_id: programId!,
      });
      if (error) throw error;
      return (data ?? []) as IncentiveRosterEntry[];
    },
  });
}
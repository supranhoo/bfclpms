import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Counts active employee mappings for a given incentive program.
 * Used by the report empty-state to surface a friendly "Compute Now" CTA.
 */
export function useIncentiveProgramMappingCount(programId?: string) {
  const enabled = !!programId && programId !== 'all';
  return useQuery({
    queryKey: ['incentive-program-mapping-count', programId],
    enabled,
    queryFn: async () => {
      const { count, error } = await supabase
        .from('incentive_program_mappings')
        .select('id', { count: 'exact', head: true })
        .eq('program_id', programId!);
      if (error) throw error;
      return count || 0;
    },
  });
}

/**
 * Resolves the FULL set of mapped employee IDs for an incentive programme by
 * walking each mapping_type → employees (mirrors the edge function logic).
 * Used by the report empty-state to surface a filter-aware count and to scope
 * Compute / Compute Now to only the rows the user is actually looking at.
 */
export function useIncentiveProgramMappedEmployeeIds(programId?: string) {
  const enabled = !!programId && programId !== 'all';
  return useQuery({
    queryKey: ['incentive-program-mapped-employee-ids', programId],
    enabled,
    queryFn: async () => {
      const { data: mappings, error: mErr } = await supabase
        .from('incentive_program_mappings')
        .select('mapping_type, mapping_value')
        .eq('program_id', programId!);
      if (mErr) throw mErr;

      const eligible = new Set<string>();
      const divIds: string[] = [];
      const deptIds: string[] = [];
      const buIds: string[] = [];
      const desigs: string[] = [];
      const grades: string[] = [];

      for (const m of mappings || []) {
        switch (m.mapping_type) {
          case 'employee': eligible.add(m.mapping_value); break;
          case 'division': divIds.push(m.mapping_value); break;
          case 'department': deptIds.push(m.mapping_value); break;
          case 'business_unit': buIds.push(m.mapping_value); break;
          case 'designation': desigs.push(m.mapping_value); break;
          case 'pms_grade': grades.push(m.mapping_value); break;
        }
      }

      // Division → BU
      if (divIds.length > 0) {
        const { data } = await supabase.from('business_units').select('id').in('division_id', divIds);
        data?.forEach((b: any) => buIds.push(b.id));
      }
      // BU → departments → employees
      if (buIds.length > 0) {
        const { data: buDepts } = await supabase.from('departments').select('id').in('business_unit_id', buIds);
        if (buDepts?.length) {
          const { data: buEmps } = await supabase
            .from('profiles').select('id').eq('is_active', true)
            .in('department_id', buDepts.map((d: any) => d.id));
          buEmps?.forEach((e: any) => eligible.add(e.id));
        }
      }
      if (deptIds.length > 0) {
        const { data } = await supabase.from('profiles').select('id').eq('is_active', true).in('department_id', deptIds);
        data?.forEach((e: any) => eligible.add(e.id));
      }
      if (desigs.length > 0) {
        const { data } = await supabase.from('profiles').select('id').eq('is_active', true).in('designation', desigs);
        data?.forEach((e: any) => eligible.add(e.id));
      }
      if (grades.length > 0) {
        const { data } = await supabase.from('profiles').select('id').eq('is_active', true).in('pms_grade', grades);
        data?.forEach((e: any) => eligible.add(e.id));
      }
      return Array.from(eligible);
    },
  });
}

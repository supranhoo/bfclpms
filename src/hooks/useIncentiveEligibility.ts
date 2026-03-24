import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useMemo } from 'react';

export interface EligibilityRow {
  id?: string;
  employee_id: string;
  review_period: string;
  review_year: number;
  absent_days: number;
  lwp_days: number;
  has_warning_letter: boolean;
  is_suspended: boolean;
  is_contract_worker: boolean;
  lti_count: number;
  department_lti_count: number;
  total_working_days: number | null;
  present_days: number | null;
  weekly_off_days: number | null;
  production_value: number | null;
  availability_percent: number | null;
  shutdown_hours: number | null;
  custom_fields?: Record<string, any>;
  remarks: string | null;
}

export function useIncentiveEligibility(reviewPeriod?: string, reviewYear?: number) {
  return useQuery({
    queryKey: ['incentive-eligibility', reviewPeriod, reviewYear],
    enabled: !!reviewPeriod && !!reviewYear,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('employee_incentive_eligibility')
        .select('*, profiles:employee_id(full_name, employee_code, department_id, departments(name), business_units:department_id(business_units(name)))')
        .eq('review_period', reviewPeriod!)
        .eq('review_year', reviewYear!);
      if (error) throw error;
      return data;
    },
  });
}

export function useUpsertEligibility() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (values: EligibilityRow & { entered_by?: string }) => {
      const { id, ...rest } = values;
      if (id) {
        const { error } = await supabase.from('employee_incentive_eligibility').update(rest).eq('id', id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('employee_incentive_eligibility').upsert(rest, { onConflict: 'employee_id,review_period,review_year' });
        if (error) throw error;
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['incentive-eligibility'] }); toast({ title: 'Eligibility saved' }); },
    onError: (e: Error) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });
}

export function useBulkUpsertEligibility() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (rows: EligibilityRow[]) => {
      const { error } = await supabase.from('employee_incentive_eligibility').upsert(
        rows as any,
        { onConflict: 'employee_id,review_period,review_year' }
      );
      if (error) throw error;
      return rows.length;
    },
    onSuccess: (count) => { qc.invalidateQueries({ queryKey: ['incentive-eligibility'] }); toast({ title: `${count} rows saved` }); },
    onError: (e: Error) => toast({ title: 'Import error', description: e.message, variant: 'destructive' }),
  });
}

// ── Resolve Program Mappings → Employee IDs ──

export function useResolvedProgramEmployees(programId?: string | 'all') {
  const { data: mappings = [] } = useQuery({
    queryKey: ['incentive-program-mappings-resolve', programId],
    queryFn: async () => {
      let query = supabase.from('incentive_program_mappings').select('*, incentive_programs(name)');
      if (programId && programId !== 'all') {
        query = query.eq('program_id', programId);
      }
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
  });

  const { data: departments = [] } = useQuery({
    queryKey: ['departments-for-mapping'],
    queryFn: async () => {
      const { data } = await supabase.from('departments').select('id, name, business_unit_id');
      return data || [];
    },
  });

  const { data: businessUnits = [] } = useQuery({
    queryKey: ['business-units-for-mapping'],
    queryFn: async () => {
      const { data } = await supabase.from('business_units').select('id, name, division_id');
      return data || [];
    },
  });

  const { data: allProfiles = [] } = useQuery({
    queryKey: ['profiles-for-mapping'],
    queryFn: async () => {
      const { data } = await supabase
        .from('profiles')
        .select('id, full_name, employee_code, department_id, designation, departments(name)')
        .eq('is_active', true)
        .order('employee_code');
      return data || [];
    },
  });

  const resolved = useMemo(() => {
    if (!mappings.length || !allProfiles.length) {
      return { employees: [] as any[], programByEmployee: new Map<string, string[]>(), hasMappings: mappings.length > 0 };
    }

    const programByEmployee = new Map<string, string[]>();

    const programMappings = new Map<string, { programName: string; maps: typeof mappings }>();
    for (const m of mappings) {
      const pid = m.program_id;
      if (!programMappings.has(pid)) {
        programMappings.set(pid, { programName: (m as any).incentive_programs?.name || pid, maps: [] });
      }
      programMappings.get(pid)!.maps.push(m);
    }

    for (const [_pid, { programName, maps }] of programMappings) {
      const directEmployeeIds = new Set<string>();
      const targetDeptIds = new Set<string>();
      const targetBuIds = new Set<string>();
      const targetDivisionIds = new Set<string>();
      const targetDesignationIds = new Set<string>();
      const targetGrades = new Set<string>();

      for (const m of maps) {
        switch (m.mapping_type) {
          case 'employee': directEmployeeIds.add(m.mapping_value); break;
          case 'department': targetDeptIds.add(m.mapping_value); break;
          case 'business_unit': targetBuIds.add(m.mapping_value); break;
          case 'division': targetDivisionIds.add(m.mapping_value); break;
          case 'designation': targetDesignationIds.add(m.mapping_value); break;
          case 'pms_grade': targetGrades.add(m.mapping_value); break;
        }
      }

      // Resolve division → BU → department cascade
      if (targetDivisionIds.size > 0) {
        for (const bu of businessUnits) {
          if (bu.division_id && targetDivisionIds.has(bu.division_id)) {
            targetBuIds.add(bu.id);
          }
        }
      }
      if (targetBuIds.size > 0) {
        for (const dept of departments) {
          if (dept.business_unit_id && targetBuIds.has(dept.business_unit_id)) {
            targetDeptIds.add(dept.id);
          }
        }
      }

      for (const profile of allProfiles) {
        let matched = false;
        if (directEmployeeIds.has(profile.id)) matched = true;
        if (!matched && profile.department_id && targetDeptIds.has(profile.department_id)) matched = true;
        if (!matched && profile.designation && targetDesignationIds.has(profile.designation)) matched = true;
        if (!matched && (profile as any).pms_grade && targetGrades.has((profile as any).pms_grade)) matched = true;

        if (matched) {
          const existing = programByEmployee.get(profile.id) || [];
          existing.push(programName);
          programByEmployee.set(profile.id, existing);
        }
      }
    }

    const matchedEmployees = allProfiles.filter((p: any) => programByEmployee.has(p.id));
    return { employees: matchedEmployees, programByEmployee, hasMappings: true };
  }, [mappings, allProfiles, departments, businessUnits]);

  return resolved;
}

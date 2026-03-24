import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

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

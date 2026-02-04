import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface EmployeeWorkingDays {
  id: string;
  employee_id: string;
  month: string;
  year: number;
  working_days: number;
  created_at: string;
  updated_at: string;
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

export function useEmployeeWorkingDays(employeeId: string | null, year: number) {
  return useQuery({
    queryKey: ['employee-working-days', employeeId, year],
    queryFn: async () => {
      if (!employeeId) return [];
      
      const { data, error } = await supabase
        .from('employee_working_days')
        .select('*')
        .eq('employee_id', employeeId)
        .eq('year', year);

      if (error) throw error;
      return data as EmployeeWorkingDays[];
    },
    enabled: !!employeeId,
  });
}

export function useEmployeeWorkingDaysForMonth(
  employeeId: string | null,
  month: string,
  year: number
) {
  return useQuery({
    queryKey: ['employee-working-days', employeeId, month, year],
    queryFn: async () => {
      if (!employeeId) return null;
      
      const { data, error } = await supabase
        .from('employee_working_days')
        .select('working_days')
        .eq('employee_id', employeeId)
        .eq('month', month)
        .eq('year', year)
        .maybeSingle();

      if (error) throw error;
      return data?.working_days ?? null;
    },
    enabled: !!employeeId && !!month,
  });
}

export function useSaveEmployeeWorkingDays() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({
      employeeId,
      year,
      monthlyDays,
    }: {
      employeeId: string;
      year: number;
      monthlyDays: Record<string, number>;
    }) => {
      // Upsert all months
      const upserts = Object.entries(monthlyDays).map(([month, working_days]) => ({
        employee_id: employeeId,
        month,
        year,
        working_days,
      }));

      const { error } = await supabase
        .from('employee_working_days')
        .upsert(upserts, {
          onConflict: 'employee_id,month,year',
        });

      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ 
        queryKey: ['employee-working-days', variables.employeeId] 
      });
      toast({ title: 'Working days saved successfully' });
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to save working days',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

export function useCopyWorkingDaysFromPreviousYear() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({
      employeeId,
      targetYear,
    }: {
      employeeId: string;
      targetYear: number;
    }) => {
      // Fetch previous year's data
      const { data: prevYearData, error: fetchError } = await supabase
        .from('employee_working_days')
        .select('month, working_days')
        .eq('employee_id', employeeId)
        .eq('year', targetYear - 1);

      if (fetchError) throw fetchError;
      if (!prevYearData || prevYearData.length === 0) {
        throw new Error('No data found for the previous year');
      }

      // Upsert to target year
      const upserts = prevYearData.map((d) => ({
        employee_id: employeeId,
        month: d.month,
        year: targetYear,
        working_days: d.working_days,
      }));

      const { error: upsertError } = await supabase
        .from('employee_working_days')
        .upsert(upserts, {
          onConflict: 'employee_id,month,year',
        });

      if (upsertError) throw upsertError;
      return prevYearData.length;
    },
    onSuccess: (count, variables) => {
      queryClient.invalidateQueries({ 
        queryKey: ['employee-working-days', variables.employeeId, variables.targetYear] 
      });
      toast({ title: `Copied ${count} months from previous year` });
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to copy from previous year',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

export { MONTHS };

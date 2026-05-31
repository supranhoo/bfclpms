import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface IncrementInputRow {
  id: string;
  assessment_year: string;
  employee_id: string;
  absent_days: number;
  lwp_days: number;
  disciplinary_actions: number;
  training_compliance: number;
  current_salary: number | null;
  dynamic_metrics: Record<string, any>;
  source: 'manual' | 'import' | 'bulk';
  remarks: string | null;
  updated_by: string | null;
  updated_at: string;
}

export function useIncrementInputs(
  assessmentYear: string | null,
  page = 0,
  pageSize = 50,
  search = '',
) {
  return useQuery({
    queryKey: ['increment-inputs', assessmentYear, page, pageSize, search],
    enabled: !!assessmentYear,
    queryFn: async () => {
      const from = page * pageSize;
      const to = from + pageSize - 1;
      const term = search.trim();
      const selectExpr = term
        ? '*, employee:profiles!increment_inputs_employee_id_fkey!inner(id, full_name, employee_code)'
        : '*, employee:profiles!increment_inputs_employee_id_fkey(id, full_name, employee_code)';
      let query = supabase
        .from('increment_inputs' as any)
        .select(selectExpr, { count: 'exact' })
        .eq('assessment_year', assessmentYear!)
        .order('updated_at', { ascending: false })
        .range(from, to);
      if (term) {
        const safe = term.replace(/[,()*]/g, ' ').trim();
        query = (query as any).or(
          `full_name.ilike.%${safe}%,employee_code.ilike.%${safe}%`,
          { foreignTable: 'employee' },
        );
      }
      const { data, error, count } = await query;
      if (error) throw error;
      return { rows: (data as any[]) ?? [], total: count ?? 0 };
    },
  });
}

export function useUpsertIncrementInput() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (input: Partial<IncrementInputRow> & { employee_id: string; assessment_year: string }) => {
      const { data: userData } = await supabase.auth.getUser();
      const payload: any = {
        ...input,
        updated_by: userData?.user?.id ?? null,
        source: input.source ?? 'manual',
      };
      const { data, error } = await supabase
        .from('increment_inputs' as any)
        .upsert(payload, { onConflict: 'employee_id,assessment_year' })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['increment-inputs', vars.assessment_year] });
      toast({ title: 'Saved', description: 'Input saved.' });
    },
    onError: (e: any) =>
      toast({ title: 'Save failed', description: e?.message ?? 'Unknown error', variant: 'destructive' }),
  });
}

export function useBulkImportIncrementInputs() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async ({
      rows,
      assessment_year,
    }: {
      rows: Array<Partial<IncrementInputRow>>;
      assessment_year: string;
    }) => {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData?.user?.id ?? null;
      const payload = rows.map((r) => ({
        ...r,
        assessment_year,
        source: 'import' as const,
        updated_by: uid,
      }));
      const { error } = await supabase
        .from('increment_inputs' as any)
        .upsert(payload, { onConflict: 'employee_id,assessment_year' });
      if (error) throw error;
      return payload.length;
    },
    onSuccess: (count, vars) => {
      qc.invalidateQueries({ queryKey: ['increment-inputs', vars.assessment_year] });
      toast({ title: 'Imported', description: `${count} rows imported.` });
    },
    onError: (e: any) =>
      toast({ title: 'Import failed', description: e?.message ?? 'Unknown error', variant: 'destructive' }),
  });
}
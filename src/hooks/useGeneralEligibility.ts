import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface GeneralEligibilityConfigRow {
  id: string;
  assessment_year: string;
  category_ids: string[];
  employment_statuses: string[];
  level_ids: string[];
  min_service_months: number;
  status: 'draft' | 'approved' | 'archived';
  version: number;
  copied_from_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export function useGeneralEligibility(assessmentYear: string | null) {
  return useQuery({
    queryKey: ['general-eligibility', assessmentYear],
    enabled: !!assessmentYear,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('general_eligibility_configs' as any)
        .select('*')
        .eq('assessment_year', assessmentYear!)
        .neq('status', 'archived')
        .order('version', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error && error.code !== 'PGRST116') throw error;
      return (data as unknown as GeneralEligibilityConfigRow) ?? null;
    },
  });
}

export function useGeneralEligibilityHistory(assessmentYear: string | null) {
  return useQuery({
    queryKey: ['general-eligibility-history', assessmentYear],
    enabled: !!assessmentYear,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('general_eligibility_configs' as any)
        .select('*')
        .eq('assessment_year', assessmentYear!)
        .order('version', { ascending: false });
      if (error) throw error;
      return (data as unknown as GeneralEligibilityConfigRow[]) ?? [];
    },
  });
}

export function useSaveGeneralEligibility() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (input: {
      assessment_year: string;
      category_ids: string[];
      employment_statuses: string[];
      level_ids: string[];
      min_service_months: number;
      previousId?: string | null;
    }) => {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData?.user?.id ?? null;

      // Determine next version
      const { data: existing } = await supabase
        .from('general_eligibility_configs' as any)
        .select('id, version')
        .eq('assessment_year', input.assessment_year)
        .order('version', { ascending: false })
        .limit(1)
        .maybeSingle();
      const nextVersion = ((existing as any)?.version ?? 0) + 1;

      // Archive prior latest
      if (existing) {
        await supabase
          .from('general_eligibility_configs' as any)
          .update({ status: 'archived' })
          .eq('id', (existing as any).id);
      }

      const { data, error } = await supabase
        .from('general_eligibility_configs' as any)
        .insert({
          assessment_year: input.assessment_year,
          category_ids: input.category_ids,
          employment_statuses: input.employment_statuses,
          level_ids: input.level_ids,
          min_service_months: input.min_service_months,
          status: 'approved',
          version: nextVersion,
          copied_from_id: input.previousId ?? null,
          created_by: uid,
        })
        .select()
        .single();
      if (error) throw error;

      await supabase.from('general_eligibility_audit' as any).insert({
        config_id: (data as any).id,
        assessment_year: input.assessment_year,
        action: existing ? 'update' : 'create',
        previous_value: (existing as any) ?? null,
        new_value: data,
        changed_by: uid,
      });

      return data;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['general-eligibility', vars.assessment_year] });
      qc.invalidateQueries({ queryKey: ['general-eligibility-history', vars.assessment_year] });
      toast({ title: 'Saved', description: 'General eligibility configuration saved.' });
    },
    onError: (e: any) => {
      toast({ title: 'Save failed', description: e?.message ?? 'Unknown error', variant: 'destructive' });
    },
  });
}
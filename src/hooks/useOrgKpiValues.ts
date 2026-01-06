import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface OrgKpiValue {
  id: string;
  category_id: string;
  kra_name: string;
  kpi_name: string;
  review_period: string;
  review_year: number;
  achieved_value: number | null;
  data_source: string | null;
  entered_by: string | null;
  remarks: string | null;
  created_at: string;
  updated_at: string;
  // Threshold fields for uniform scoring mode
  target_value: number | null;
  r5: string | null;
  r4: string | null;
  r3: string | null;
  r2: string | null;
  r1: string | null;
  r0: string | null;
  criteria: string | null;
}

export function useOrgKpiValues(categoryId?: string, reviewPeriod?: string, reviewYear?: number) {
  return useQuery({
    queryKey: ['org-kpi-values', categoryId, reviewPeriod, reviewYear],
    queryFn: async () => {
      let query = supabase
        .from('org_kpi_values')
        .select('*')
        .order('kra_name')
        .order('kpi_name');

      if (categoryId) {
        query = query.eq('category_id', categoryId);
      }
      if (reviewPeriod) {
        query = query.eq('review_period', reviewPeriod);
      }
      if (reviewYear) {
        query = query.eq('review_year', reviewYear);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as OrgKpiValue[];
    },
    enabled: !!categoryId || !!reviewPeriod || !!reviewYear,
  });
}

export function useOrgKpiValueByKpi(categoryId: string, kraName: string, kpiName: string, reviewPeriod: string, reviewYear: number) {
  return useQuery({
    queryKey: ['org-kpi-value', categoryId, kraName, kpiName, reviewPeriod, reviewYear],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('org_kpi_values')
        .select('*')
        .eq('category_id', categoryId)
        .eq('kra_name', kraName)
        .eq('kpi_name', kpiName)
        .eq('review_period', reviewPeriod)
        .eq('review_year', reviewYear)
        .maybeSingle();

      if (error) throw error;
      return data as OrgKpiValue | null;
    },
    enabled: !!categoryId && !!kraName && !!kpiName && !!reviewPeriod && !!reviewYear,
  });
}

export function useUpsertOrgKpiValue() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (value: {
      category_id: string;
      kra_name: string;
      kpi_name: string;
      review_period: string;
      review_year: number;
      achieved_value: number | null;
      data_source?: string;
      remarks?: string;
      entered_by?: string;
    }) => {
      const { data, error } = await supabase
        .from('org_kpi_values')
        .upsert(value, {
          onConflict: 'category_id,kra_name,kpi_name,review_period,review_year',
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['org-kpi-values'] });
      queryClient.invalidateQueries({ queryKey: ['org-kpi-value'] });
      toast({ title: 'Organization KPI value saved' });
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to save value', description: error.message, variant: 'destructive' });
    },
  });
}

export function useBulkUpsertOrgKpiValues() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (values: Array<{
      category_id: string;
      kra_name: string;
      kpi_name: string;
      review_period: string;
      review_year: number;
      achieved_value: number | null;
      data_source?: string;
      remarks?: string;
      entered_by?: string;
    }>) => {
      const { data, error } = await supabase
        .from('org_kpi_values')
        .upsert(values, {
          onConflict: 'category_id,kra_name,kpi_name,review_period,review_year',
        })
        .select();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['org-kpi-values'] });
      queryClient.invalidateQueries({ queryKey: ['org-kpi-value'] });
      toast({ title: `${data.length} values saved successfully` });
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to save values', description: error.message, variant: 'destructive' });
    },
  });
}

export function useDeleteOrgKpiValue() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('org_kpi_values')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['org-kpi-values'] });
      queryClient.invalidateQueries({ queryKey: ['org-kpi-value'] });
      toast({ title: 'Value deleted' });
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to delete value', description: error.message, variant: 'destructive' });
    },
  });
}

// Hook to get org-level categories
export function useOrgLevelCategories() {
  return useQuery({
    queryKey: ['org-level-categories'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('kra_categories')
        .select('*')
        .eq('is_org_level', true)
        .order('name');

      if (error) throw error;
      return data;
    },
  });
}

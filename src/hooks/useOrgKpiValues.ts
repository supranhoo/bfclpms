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
  // Scoped values
  department_id: string | null;
  employee_id: string | null;
  // Status and send-back workflow fields
  status: string | null;
  sent_back_by: string | null;
  sent_back_at: string | null;
  sent_back_reason: string | null;
  submission_count: number | null;
  // Evidence/supporting file
  evidence_url: string | null;
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
      department_id?: string;
      employee_id?: string;
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
      department_id?: string;
      employee_id?: string;
      target_value?: number | null;
      r5?: string;
      r4?: string;
      r3?: string;
      r2?: string;
      r1?: string;
      r0?: string;
      criteria?: string;
      evidence_url?: string | null;
    }>) => {
      // For scoped values, we need to handle the unique constraint properly
      // Insert/update each value individually to handle the complex unique index
      const results = [];
      for (const value of values) {
        // First try to find existing record
        let query = supabase
          .from('org_kpi_values')
          .select('id')
          .eq('category_id', value.category_id)
          .eq('kra_name', value.kra_name)
          .eq('kpi_name', value.kpi_name)
          .eq('review_period', value.review_period)
          .eq('review_year', value.review_year);
        
        if (value.department_id) {
          query = query.eq('department_id', value.department_id);
        } else {
          query = query.is('department_id', null);
        }
        
        if (value.employee_id) {
          query = query.eq('employee_id', value.employee_id);
        } else {
          query = query.is('employee_id', null);
        }

        const { data: existing } = await query.maybeSingle();

        if (existing) {
          // Update existing
          const { data, error } = await supabase
            .from('org_kpi_values')
            .update({
              achieved_value: value.achieved_value,
              data_source: value.data_source,
              remarks: value.remarks,
              entered_by: value.entered_by,
              target_value: value.target_value,
              r5: value.r5,
              r4: value.r4,
              r3: value.r3,
              r2: value.r2,
              r1: value.r1,
              r0: value.r0,
              criteria: value.criteria,
              evidence_url: value.evidence_url,
            })
            .eq('id', existing.id)
            .select()
            .single();
          if (error) throw error;
          results.push(data);
        } else {
          // Insert new
          const { data, error } = await supabase
            .from('org_kpi_values')
            .insert(value)
            .select()
            .single();
          if (error) throw error;
          results.push(data);
        }
      }
      return results;
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

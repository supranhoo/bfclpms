import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface OrgKpiAuditEntry {
  id: string;
  org_kpi_value_id: string | null;
  category_id: string;
  kra_name: string;
  kpi_name: string;
  review_period: string;
  review_year: number;
  action: string;
  performed_by: string | null;
  old_value: number | null;
  new_value: number | null;
  remarks: string | null;
  created_at: string;
  performer?: { full_name: string | null; email: string } | null;
}

export function useOrgKpiAuditLog(
  categoryId: string,
  kraName: string,
  kpiName: string,
  reviewPeriod: string,
  reviewYear: number,
  enabled = true
) {
  return useQuery({
    queryKey: ['org-kpi-audit-log', categoryId, kraName, kpiName, reviewPeriod, reviewYear],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('org_kpi_data_entry_logs')
        .select('*')
        .eq('category_id', categoryId)
        .eq('kra_name', kraName)
        .eq('kpi_name', kpiName)
        .eq('review_period', reviewPeriod)
        .eq('review_year', reviewYear)
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) throw error;

      // Fetch performer names separately
      const performerIds = [...new Set(data?.map(d => d.performed_by).filter(Boolean) as string[])];
      let performerMap = new Map<string, { full_name: string | null; email: string }>();
      if (performerIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name, email')
          .in('id', performerIds);
        profiles?.forEach(p => performerMap.set(p.id, { full_name: p.full_name, email: p.email }));
      }

      return (data || []).map(d => ({
        ...d,
        performer: d.performed_by ? performerMap.get(d.performed_by) || null : null,
      })) as OrgKpiAuditEntry[];
    },
    enabled: enabled && !!categoryId && !!kraName && !!kpiName,
    // Perf (Wave 4): called once per Org KPI row in the data-entry page
    // (often 50–100 rows). Without a staleTime each render/focus refetched
    // the same tuple, matching the pre-fix pattern of
    // useSentBackOrgKpiEmployees that drove 138k+ daily calls to
    // org_kpi_data_entry_logs. Mutations in this file invalidate the
    // query key explicitly, so a 5-min stale window is safe.
    staleTime: 5 * 60_000,
    gcTime: 10 * 60_000,
    refetchOnWindowFocus: false,
  });
}

export function useInsertAuditLog() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (entry: {
      org_kpi_value_id?: string | null;
      category_id: string;
      kra_name: string;
      kpi_name: string;
      review_period: string;
      review_year: number;
      action: string;
      performed_by: string;
      old_value?: number | null;
      new_value?: number | null;
      remarks?: string | null;
    }) => {
      const { error } = await supabase
        .from('org_kpi_data_entry_logs')
        .insert(entry);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['org-kpi-audit-log'] });
    },
  });
}

export function useBatchInsertAuditLogs() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (entries: Array<{
      org_kpi_value_id?: string | null;
      category_id: string;
      kra_name: string;
      kpi_name: string;
      review_period: string;
      review_year: number;
      action: string;
      performed_by: string;
      old_value?: number | null;
      new_value?: number | null;
      remarks?: string | null;
    }>) => {
      if (entries.length === 0) return;
      const { error } = await supabase
        .from('org_kpi_data_entry_logs')
        .insert(entries);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['org-kpi-audit-log'] });
    },
  });
}

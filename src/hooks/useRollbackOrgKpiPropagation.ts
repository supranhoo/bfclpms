import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';

interface RollbackParams {
  categoryId: string;
  kraName: string;
  kpiName: string;
  reviewPeriod: string;
  reviewYear: number;
  reason: string;
}

export function useRollbackOrgKpiPropagation() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (params: RollbackParams) => {
      const { categoryId, kraName, kpiName, reviewPeriod, reviewYear, reason } = params;
      const performedBy = profile?.id;

      // 1. Find all employee KPIs matching this org KPI
      const { data: employeeKpis, error: kpiError } = await supabase
        .from('kpis')
        .select('id')
        .eq('category_id', categoryId)
        .eq('kra_name', kraName)
        .eq('kpi_name', kpiName)
        .eq('review_period', reviewPeriod)
        .eq('review_year', reviewYear)
        .eq('is_org_level', true);

      if (kpiError) throw kpiError;

      const kpiIds = employeeKpis?.map(k => k.id) || [];
      let clearedCount = 0;

      if (kpiIds.length > 0) {
        // 2. Clear their review_submissions
        const { error: subError } = await supabase
          .from('review_submissions')
          .update({
            achieved_value: null,
            self_score: null,
            self_rating: null,
          })
          .in('kpi_id', kpiIds);

        if (subError) throw subError;
        clearedCount = kpiIds.length;

        // 3. Reset KPI status back to kra_set (only if currently at self_review)
        const { error: statusError } = await supabase
          .from('kpis')
          .update({ status: 'kra_set', updated_at: new Date().toISOString() })
          .in('id', kpiIds)
          .eq('status', 'self_review');

        if (statusError) throw statusError;
      }

      // 4. Reset org_kpi_values to pending
      const { data: orgValues } = await supabase
        .from('org_kpi_values')
        .select('id, achieved_value')
        .eq('category_id', categoryId)
        .eq('kra_name', kraName)
        .eq('kpi_name', kpiName)
        .eq('review_period', reviewPeriod)
        .eq('review_year', reviewYear);

      const oldValue = orgValues?.[0]?.achieved_value ?? null;

      const { error: resetError } = await supabase
        .from('org_kpi_values')
        .update({
          status: 'pending',
          achieved_value: null,
          remarks: null,
          evidence_url: null,
          updated_at: new Date().toISOString(),
        })
        .eq('category_id', categoryId)
        .eq('kra_name', kraName)
        .eq('kpi_name', kpiName)
        .eq('review_period', reviewPeriod)
        .eq('review_year', reviewYear);

      if (resetError) throw resetError;

      // 5. Log audit entry
      if (performedBy) {
        try {
          await supabase
            .from('org_kpi_data_entry_logs')
            .insert({
              category_id: categoryId,
              kra_name: kraName,
              kpi_name: kpiName,
              review_period: reviewPeriod,
              review_year: reviewYear,
              action: 'rollback_to_data_entry',
              performed_by: performedBy,
              old_value: oldValue,
              new_value: null,
              remarks: reason,
            });
        } catch { /* non-blocking */ }
      }

      // 6. Notify data owners
      if (performedBy) {
        try {
          const { data: owners } = await supabase
            .from('org_kpi_data_owners')
            .select('owner_id')
            .eq('category_id', categoryId)
            .eq('kra_name', kraName)
            .eq('kpi_name', kpiName);

          const ownerIds = owners?.map(o => o.owner_id).filter(id => id !== performedBy) || [];
          if (ownerIds.length > 0) {
            const notifications = ownerIds.map(ownerId => ({
              user_id: ownerId,
              title: 'Org KPI Rolled Back',
              message: `"${kpiName}" for ${reviewPeriod} ${reviewYear} has been rolled back to data entry. Reason: ${reason}`,
              type: 'org_kpi_rollback',
            }));
            await supabase.from('notifications').insert(notifications);
          }
        } catch { /* non-blocking */ }
      }

      return { clearedCount };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['org-kpi-values'] });
      queryClient.invalidateQueries({ queryKey: ['org-kpi-audit-log'] });
      toast({
        title: 'Rolled back to data entry',
        description: `Cleared propagated values from ${result.clearedCount} employee scorecard${result.clearedCount !== 1 ? 's' : ''}.`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Rollback failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

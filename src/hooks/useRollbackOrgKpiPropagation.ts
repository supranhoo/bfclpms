import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';

interface BulkRollbackParams {
  kraName: string;
  kpiName: string;
  reviewPeriod: string;
  reviewYear: number;
  reason: string;
}


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

/**
 * Bulk rollback: rolls back ALL scoped org_kpi_values records for a given
 * kra_name + kpi_name combination across every department/employee scope,
 * regardless of category_id. Designed for department-scoped KPIs where
 * a single propagation may have touched 27+ scopes simultaneously.
 */
export function useBulkRollbackOrgKpiPropagation() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (params: BulkRollbackParams) => {
      const { kraName, kpiName, reviewPeriod, reviewYear, reason } = params;
      const performedBy = profile?.id;

      // 1. Find all propagated org_kpi_values for this KRA+KPI combination
      // NOTE: The UI defines "propagated" as status IN ('propagated','approved')
      // (see src/pages/admin/OrgKpiDataEntry.tsx — `isPropagated` derivation).
      // The bulk rollback must mirror that union, otherwise cards whose scopes
      // are mixed propagated/approved (or stale after individual rollbacks) will
      // throw "No propagated scopes found" while the button is still showing.
      const { data: orgValues, error: orgError } = await supabase
        .from('org_kpi_values')
        .select('id, achieved_value, category_id')
        .eq('kra_name', kraName)
        .eq('kpi_name', kpiName)
        .eq('review_period', reviewPeriod)
        .eq('review_year', reviewYear)
        .in('status', ['propagated', 'approved']);

      if (orgError) throw orgError;
      if (!orgValues || orgValues.length === 0) {
        // Refresh the stale card before surfacing the error so the user sees
        // the current truth (e.g. all scopes already rolled back individually).
        queryClient.invalidateQueries({ queryKey: ['org-kpi-values'] });
        throw new Error(
          'No propagated scopes to bulk-roll-back for this period. If child scorecards have advanced through a non-propagation path, roll each scope back individually from the per-row table. The view has been refreshed.'
        );
      }

      // 2. Find all employee KPIs matching this org KPI (is_org_level = true)
      const categoryIds = [...new Set(orgValues.map(v => v.category_id))];

      const { data: employeeKpis, error: kpiError } = await supabase
        .from('kpis')
        .select('id, category_id')
        .in('category_id', categoryIds)
        .eq('kra_name', kraName)
        .eq('kpi_name', kpiName)
        .eq('review_period', reviewPeriod)
        .eq('review_year', reviewYear)
        .eq('is_org_level', true);

      if (kpiError) throw kpiError;

      const kpiIds = employeeKpis?.map(k => k.id) || [];
      let clearedCount = 0;

      if (kpiIds.length > 0) {
        // 3. Clear review_submissions for all affected employee KPIs
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

        // 4. Reset KPI status back to kra_set (only those still at self_review)
        const { error: statusError } = await supabase
          .from('kpis')
          .update({ status: 'kra_set', updated_at: new Date().toISOString() })
          .in('id', kpiIds)
          .eq('status', 'self_review');

        if (statusError) throw statusError;
      }

      // 5. Reset all matching org_kpi_values to pending
      const orgValueIds = orgValues.map(v => v.id);
      const { error: resetError } = await supabase
        .from('org_kpi_values')
        .update({
          status: 'pending',
          achieved_value: null,
          remarks: null,
          evidence_url: null,
          updated_at: new Date().toISOString(),
        })
        .in('id', orgValueIds);

      if (resetError) throw resetError;

      // 6. Log one audit entry per org_kpi_value record
      if (performedBy) {
        try {
          const auditEntries = orgValues.map(v => ({
            category_id: v.category_id,
            kra_name: kraName,
            kpi_name: kpiName,
            review_period: reviewPeriod,
            review_year: reviewYear,
            action: 'bulk_rollback_to_data_entry',
            performed_by: performedBy,
            old_value: v.achieved_value,
            new_value: null,
            remarks: reason,
          }));
          await supabase.from('org_kpi_data_entry_logs').insert(auditEntries);
        } catch { /* non-blocking */ }
      }

      // 7. Notify all data owners assigned to this KPI
      if (performedBy) {
        try {
          const { data: owners } = await supabase
            .from('org_kpi_data_owners')
            .select('owner_id, category_id')
            .in('category_id', categoryIds)
            .eq('kra_name', kraName)
            .eq('kpi_name', kpiName);

          const ownerIds = [...new Set(
            owners?.map(o => o.owner_id).filter((id): id is string => id !== null && id !== performedBy) || []
          )];

          if (ownerIds.length > 0) {
            const notifications = ownerIds.map(ownerId => ({
              user_id: ownerId,
              title: 'Org KPI Bulk Rolled Back',
              message: `All ${orgValues.length} scope${orgValues.length !== 1 ? 's' : ''} of "${kpiName}" for ${reviewPeriod} ${reviewYear} have been rolled back to data entry. Reason: ${reason}`,
              type: 'org_kpi_rollback',
            }));
            await supabase.from('notifications').insert(notifications);
          }
        } catch { /* non-blocking */ }
      }

      return { clearedCount, scopeCount: orgValues.length };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['org-kpi-values'] });
      queryClient.invalidateQueries({ queryKey: ['org-kpi-audit-log'] });
      toast({
        title: 'All scopes rolled back',
        description: `Rolled back ${result.scopeCount} scope${result.scopeCount !== 1 ? 's' : ''} and cleared values from ${result.clearedCount} employee scorecard${result.clearedCount !== 1 ? 's' : ''}.`,
      });
    },
    onError: (error: Error) => {
      // Always refresh on error so a stale card cannot keep the user stuck.
      queryClient.invalidateQueries({ queryKey: ['org-kpi-values'] });
      toast({
        title: 'Bulk rollback failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}


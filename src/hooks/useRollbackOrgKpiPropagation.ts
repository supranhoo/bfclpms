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
 * Bulk rollback (ADR-227 — child-truth rollback).
 *
 * Previously the work list was derived from `org_kpi_values` rows in
 * `propagated`/`approved` state. When a partial action had already reset the
 * master rows to `draft` while the child scorecards still carried the wrong
 * value, the hook aborted with "No propagated scopes…" and the erroneous data
 * stayed on every scorecard.
 *
 * The single RPC below derives the work list from the CHILD `kpis` rows
 * (is_org_level + KRA/KPI/period/year) and runs everything in one
 * transaction: clears review_submissions (all reviewer stages), steps the
 * cells back to `kra_set` — including admin-forced rollback of cells already
 * at `manager_check` — resets the master rows, audits and notifies.
 * `approved` / `management_review` cells are never touched and are reported
 * back as skipped so frozen final scores stay immutable.
 */
export function useBulkRollbackOrgKpiPropagation() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (params: BulkRollbackParams) => {
      const { kraName, kpiName, reviewPeriod, reviewYear, reason } = params;

      const { data, error } = await supabase.rpc(
        'rollback_org_kpi_propagation_by_children',
        {
          p_kra_name: kraName,
          p_kpi_name: kpiName,
          p_review_period: reviewPeriod,
          p_review_year: reviewYear,
          p_reason: reason,
        },
      );

      if (error) throw new Error(error.message);

      const result = (data ?? {}) as {
        scopes_reset?: number;
        scorecards_cleared?: number;
        manager_stage_cleared?: number;
        skipped_approved?: number;
        total_children?: number;
      };

      if ((result.total_children ?? 0) === 0) {
        queryClient.invalidateQueries({ queryKey: ['org-kpi-values'] });
        throw new Error(
          'Nothing to roll back — no organisation-level scorecards exist for this KPI and period. The view has been refreshed.',
        );
      }

      return {
        scopeCount: result.scopes_reset ?? 0,
        clearedCount: result.scorecards_cleared ?? 0,
        managerStageCleared: result.manager_stage_cleared ?? 0,
        skippedApproved: result.skipped_approved ?? 0,
      };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['org-kpi-values'] });
      queryClient.invalidateQueries({ queryKey: ['org-kpi-audit-log'] });
      const extras: string[] = [];
      if (result.managerStageCleared > 0) {
        extras.push(`${result.managerStageCleared} had already been reviewed and were force-reset`);
      }
      if (result.skippedApproved > 0) {
        extras.push(`${result.skippedApproved} approved scorecard${result.skippedApproved !== 1 ? 's were' : ' was'} skipped`);
      }
      toast({
        title: 'All scopes rolled back',
        description:
          `Rolled back ${result.scopeCount} scope${result.scopeCount !== 1 ? 's' : ''} and cleared values from ` +
          `${result.clearedCount} employee scorecard${result.clearedCount !== 1 ? 's' : ''}.` +
          (extras.length > 0 ? ` ${extras.join('; ')}.` : ''),
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


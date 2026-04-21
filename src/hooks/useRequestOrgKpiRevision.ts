import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface RequestRevisionParams {
  kpiId: string;
  reason: string;
  /** Optional metadata for downstream notifications (DO + employees) */
  kraName?: string;
  kpiName?: string;
  categoryId?: string;
}

interface RevisionResult {
  success: boolean;
  okv_id: string;
  previous_okv_status: string;
  cascade_rolled_back: number;
  cascade_flagged: number;
  revision_count: number;
}

/**
 * Phase B1 — Reviewer "Request Revision from Data Owner" action for org-level KPIs.
 * Atomically reverts the OKV to draft, cascades rollback to early-stage employees,
 * flags late-stage employees, audit-logs everything, and notifies data owners.
 */
export function useRequestOrgKpiRevision() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ kpiId, reason, kraName, kpiName, categoryId }: RequestRevisionParams) => {
      // 1. Atomic RPC handles OKV revert + cascade + audit logs
      const { data, error } = await supabase.rpc('request_org_kpi_revision', {
        p_kpi_id: kpiId,
        p_reason: reason,
      });

      if (error) throw error;
      const result = data as unknown as RevisionResult;

      // 2. Notify data owners (best-effort, non-blocking on the atomic write)
      if (categoryId && kraName && kpiName) {
        try {
          const { data: owners } = await supabase
            .from('org_kpi_data_owners')
            .select('owner_id')
            .eq('category_id', categoryId)
            .eq('kra_name', kraName)
            .eq('kpi_name', kpiName);

          if (owners && owners.length > 0) {
            const ownerIds = owners.map(o => o.owner_id);

            // App notifications
            await supabase.from('notifications').insert(
              ownerIds.map(uid => ({
                user_id: uid,
                type: 'org_kpi_revision_requested',
                title: 'Org KPI Revision Requested',
                message: `A reviewer has requested revision of "${kpiName}". Reason: ${reason}`,
                metadata: {
                  okv_id: result.okv_id,
                  category_id: categoryId,
                  kra_name: kraName,
                  kpi_name: kpiName,
                  reason,
                  cascade_rolled_back: result.cascade_rolled_back,
                  cascade_flagged: result.cascade_flagged,
                },
              }))
            );

            // Email notifications
            const { data: profiles } = await supabase
              .from('profiles')
              .select('id, full_name, email')
              .in('id', ownerIds);

            profiles?.forEach(p => {
              supabase.functions.invoke('send-email-notification', {
                body: {
                  event_type: 'org_kpi_revision_requested',
                  recipient_email: p.email,
                  recipient_name: p.full_name || p.email,
                  kpi_name: kpiName,
                  kra_name: kraName,
                  send_back_reason: reason,
                  recipient_role: 'data_owner',
                },
              }).catch(err => console.error('Revision email failed:', err));
            });
          }
        } catch (notifyErr) {
          // Notification failures should not abort the revision (already committed)
          console.error('Revision notification dispatch failed:', notifyErr);
        }
      }

      return result;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['org-kpi-values'] });
      queryClient.invalidateQueries({ queryKey: ['kpis'] });
      queryClient.invalidateQueries({ queryKey: ['kpi-audit-logs'] });
      queryClient.invalidateQueries({ queryKey: ['employee-scorecard'] });

      const parts: string[] = [];
      if (result.cascade_rolled_back > 0) parts.push(`${result.cascade_rolled_back} rolled back`);
      if (result.cascade_flagged > 0) parts.push(`${result.cascade_flagged} flagged (past manager check)`);

      toast({
        title: 'Revision requested from Data Owner',
        description: parts.length > 0
          ? `Org KPI value reverted to draft. ${parts.join(', ')}.`
          : 'Org KPI value reverted to draft.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to request revision',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

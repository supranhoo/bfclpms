import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { resolvePreviousStatus } from '@/lib/workflowEngine';

/** Comprehensive ordered list of all possible workflow statuses for fallback resolution */
const ALL_WORKFLOW_STATUSES = [
  'kra_set', 'self_review', 'manager_check', 'skip_level_check',
  'hr_pms_review', 'audit', 'management_review', 'approved'
];

export interface RollbackRequest {
  id: string;
  kpi_id: string;
  requested_by: string;
  requested_from_status: string;
  target_status: string;
  reason: string;
  status: string;
  actioned_by: string | null;
  actioned_at: string | null;
  created_at: string;
  requester_profile?: { full_name: string | null; employee_code: string | null };
}

export function usePendingRollbackRequest(kpiId: string | undefined) {
  return useQuery({
    queryKey: ['rollback-request', kpiId],
    queryFn: async () => {
      if (!kpiId) return null;
      const { data, error } = await supabase
        .from('kpi_rollback_requests')
        .select('*, requester_profile:profiles!kpi_rollback_requests_requested_by_fkey(full_name, employee_code)')
        .eq('kpi_id', kpiId)
        .eq('status', 'pending')
        .maybeSingle();

      if (error) throw error;
      return data as RollbackRequest | null;
    },
    enabled: !!kpiId,
  });
}

export function useCreateRollbackRequest() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({
      kpi_id,
      reason,
      current_status,
      workflow_stages,
      notify_user_id,
    }: {
      kpi_id: string;
      reason: string;
      current_status: string;
      workflow_stages: string[];
      notify_user_id?: string;
    }) => {
      if (!user?.id) throw new Error('Not authenticated');

      let targetStatus = resolvePreviousStatus(current_status, workflow_stages);

      // Safety fallback: if the current status wasn't found in the provided stages,
      // try resolving against the comprehensive all-stages list
      if (!targetStatus) {
        const fallbackIdx = ALL_WORKFLOW_STATUSES.indexOf(current_status);
        if (fallbackIdx > 0) {
          targetStatus = ALL_WORKFLOW_STATUSES[fallbackIdx - 1];
          console.warn(
            `[Rollback] Fallback resolution used: ${current_status} → ${targetStatus}. ` +
            `Provided stages did not contain current status.`
          );
        }
      }

      if (!targetStatus) throw new Error('Cannot determine rollback target status');

      const { data, error } = await supabase
        .from('kpi_rollback_requests')
        .insert({
          kpi_id,
          requested_by: user.id,
          requested_from_status: current_status,
          target_status: targetStatus,
          reason,
        })
        .select()
        .single();

      if (error) {
        if (error.code === '23505') throw new Error('A rollback request is already pending for this KPI');
        throw error;
      }

      // Create notification for the next-level reviewer
      if (notify_user_id) {
        await supabase.from('notifications').insert({
          user_id: notify_user_id,
          type: 'rollback_requested',
          title: 'Rollback Requested',
          message: `A rollback has been requested for a KPI. Reason: ${reason}`,
          kpi_id,
          related_user_id: user.id,
          metadata: { rollback_request_id: data.id, reason },
        });
      }

      // Audit log
      await supabase.from('kpi_audit_logs').insert({
        kpi_id,
        action: 'ROLLBACK_REQUESTED',
        performed_by: user.id,
        new_value: { reason, target_status: targetStatus },
        metadata: { rollback_request_id: data.id },
      });

      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['rollback-request', variables.kpi_id] });
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      toast({ title: 'Rollback requested', description: 'The reviewer has been notified.' });
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to request rollback', description: error.message, variant: 'destructive' });
    },
  });
}

export function useApproveRollbackRequest() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({
      request_id,
      kpi_id,
      target_status,
      requested_by,
    }: {
      request_id: string;
      kpi_id: string;
      target_status: string;
      requested_by: string;
    }) => {
      if (!user?.id) throw new Error('Not authenticated');

      // Update rollback request status
      const { error: reqError } = await supabase
        .from('kpi_rollback_requests')
        .update({ status: 'approved', actioned_by: user.id, actioned_at: new Date().toISOString() })
        .eq('id', request_id);

      if (reqError) throw reqError;

      // Revert KPI status
      const { error: kpiError } = await supabase
        .from('kpis')
        .update({ status: target_status as any })
        .eq('id', kpi_id);

      if (kpiError) throw kpiError;

      // Clear downstream reviewer fields in review_submissions
      // All stages after target_status must have their data nulled out
      const STAGE_FIELD_MAP: Record<string, string[]> = {
        manager_check: ['manager_score', 'manager_rating', 'manager_remarks', 'manager_evidence_url', 'manager_achieved_value'],
        skip_level_check: ['skip_level_score', 'skip_level_rating', 'skip_level_remarks', 'skip_level_evidence_url', 'skip_level_achieved_value'],
        hr_pms_review: ['hr_pms_score', 'hr_pms_rating', 'hr_pms_remarks', 'hr_pms_evidence_url', 'hr_pms_achieved_value'],
        audit: ['auditor_score', 'auditor_rating', 'auditor_remarks', 'auditor_evidence_url', 'auditor_achieved_value'],
        management_review: ['management_score', 'management_rating', 'management_remarks', 'management_evidence_url', 'management_achieved_value'],
      };
      const CANONICAL_ORDER = ['self_review', 'manager_check', 'skip_level_check', 'hr_pms_review', 'audit', 'management_review'];
      const targetIdx = CANONICAL_ORDER.indexOf(target_status);
      const clearFields: Record<string, null> = { final_score: null, final_rating: null };
      CANONICAL_ORDER.forEach((stage, idx) => {
        if (idx >= targetIdx && STAGE_FIELD_MAP[stage]) {
          STAGE_FIELD_MAP[stage].forEach(field => { clearFields[field] = null; });
        }
      });

      const { error: clearError } = await supabase
        .from('review_submissions')
        .update({ ...clearFields, updated_at: new Date().toISOString() } as any)
        .eq('kpi_id', kpi_id);

      if (clearError) {
        console.error('[Rollback] Failed to clear downstream fields:', clearError);
      }

      // Notify requester
      await supabase.from('notifications').insert({
        user_id: requested_by,
        type: 'rollback_approved',
        title: 'Rollback Approved',
        message: 'Your rollback request has been approved. You can now edit and resubmit.',
        kpi_id,
        related_user_id: user.id,
        metadata: { rollback_request_id: request_id },
      });

      // Notify the newly-active reviewer (the user whose stage becomes active after rollback).
      // target_status = last completed stage; active stage = next stage in the workflow.
      // Non-blocking — failures here must not break the approval.
      try {
        const { data: kpiRow } = await supabase
          .from('kpis')
          .select('employee_id, kpi_name')
          .eq('id', kpi_id)
          .maybeSingle();

        if (kpiRow?.employee_id) {
          // Map target_status -> the user who must act next.
          // - target_status 'kra_set' | 'self_review'  => employee acts next
          // - target_status 'manager_check'            => skip-level manager acts next
          // - target_status 'skip_level_check' onward  => no deterministic single recipient (HR PMS / auditor groups); skip
          let nextReviewerId: string | null = null;

          if (target_status === 'kra_set' || target_status === 'self_review') {
            nextReviewerId = kpiRow.employee_id;
          } else if (target_status === 'manager_check') {
            // Active stage = skip_level_check. Fetch employee -> reporting_manager -> reporting_manager (= SLM).
            const { data: emp } = await supabase
              .from('profiles')
              .select('reporting_manager_id')
              .eq('id', kpiRow.employee_id)
              .maybeSingle();
            if (emp?.reporting_manager_id) {
              const { data: mgr } = await supabase
                .from('profiles')
                .select('reporting_manager_id')
                .eq('id', emp.reporting_manager_id)
                .maybeSingle();
              nextReviewerId = mgr?.reporting_manager_id || null;
            }
          }

          if (nextReviewerId && nextReviewerId !== requested_by) {
            await supabase.from('notifications').insert({
              user_id: nextReviewerId,
              type: 'rollback_active_reviewer',
              title: 'KPI Returned for Review',
              message: `"${kpiRow.kpi_name ?? 'A KPI'}" has been returned to your stage following an approved rollback.`,
              kpi_id,
              related_user_id: user.id,
              metadata: { rollback_request_id: request_id, target_status },
            });
          }
        }
      } catch (notifyErr) {
        console.warn('[Rollback] Failed to notify next active reviewer:', notifyErr);
      }

      // Audit log
      await supabase.from('kpi_audit_logs').insert({
        kpi_id,
        action: 'ROLLBACK_APPROVED',
        performed_by: user.id,
        new_value: { target_status },
        metadata: { rollback_request_id: request_id, approved_by: user.id },
      });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['rollback-request', variables.kpi_id] });
      queryClient.invalidateQueries({ queryKey: ['kpis'] });
      queryClient.invalidateQueries({ queryKey: ['my-kpis'] });
      queryClient.invalidateQueries({ queryKey: ['review-submissions'] });
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['all-rollback-requests'] });
      queryClient.invalidateQueries({ queryKey: ['rollback-status-counts'] });
      // Reviewer-grid / queue queries that filter by kpi.status — must be refetched
      // so the KPI re-appears in the newly-active reviewer's queue without a hard refresh.
      queryClient.invalidateQueries({ queryKey: ['kpis-by-period'] });
      queryClient.invalidateQueries({ queryKey: ['kpis-by-period-ranges'] });
      queryClient.invalidateQueries({ queryKey: ['all-kpis'] });
      queryClient.invalidateQueries({ queryKey: ['review-submission-scores-by-kpi-ids'] });
      queryClient.invalidateQueries({ queryKey: ['employee-kpi-stats'] });
      queryClient.invalidateQueries({ queryKey: ['team-employees'] });
      queryClient.invalidateQueries({ queryKey: ['sent-back-kpis'] });
      toast({ title: 'Rollback approved', description: 'KPI has been sent back for revision.' });
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to approve rollback', description: error.message, variant: 'destructive' });
    },
  });
}

export function useRejectRollbackRequest() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({
      request_id,
      kpi_id,
      requested_by,
    }: {
      request_id: string;
      kpi_id: string;
      requested_by: string;
    }) => {
      if (!user?.id) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('kpi_rollback_requests')
        .update({ status: 'rejected', actioned_by: user.id, actioned_at: new Date().toISOString() })
        .eq('id', request_id);

      if (error) throw error;

      // Notify requester
      await supabase.from('notifications').insert({
        user_id: requested_by,
        type: 'rollback_rejected',
        title: 'Rollback Request Dismissed',
        message: 'Your rollback request has been dismissed by the reviewer.',
        kpi_id,
        related_user_id: user.id,
        metadata: { rollback_request_id: request_id },
      });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['rollback-request', variables.kpi_id] });
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['all-rollback-requests'] });
      queryClient.invalidateQueries({ queryKey: ['rollback-status-counts'] });
      toast({ title: 'Rollback request dismissed' });
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to dismiss request', description: error.message, variant: 'destructive' });
    },
  });
}

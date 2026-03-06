import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';

export interface ReviewPeriodLock {
  id: string;
  review_period_id: string;
  lock_type: 'global' | 'role' | 'department' | 'employee';
  target_id: string | null;
  permissions: Record<string, boolean>;
  is_locked: boolean;
  locked_by: string | null;
  locked_at: string | null;
  unlock_reason: string | null;
  reason: string | null;
  created_at: string;
}

export interface ReviewPeriodStageRecord {
  id: string;
  review_period_id: string;
  stage: string;
  started_at: string;
  ended_at: string | null;
  started_by: string | null;
}

export interface ReviewPeriodAuditEntry {
  id: string;
  review_period_id: string;
  action: string;
  performed_by: string | null;
  previous_state: Record<string, unknown> | null;
  new_state: Record<string, unknown> | null;
  reason: string | null;
  target_type: string | null;
  target_id: string | null;
  created_at: string;
}

export const GOVERNANCE_STAGES = [
  'planning',
  'self_review',
  'manager_review',
  'calibration',
  'approval',
  'closed',
] as const;

export type GovernanceStage = typeof GOVERNANCE_STAGES[number];

export const STAGE_LABELS: Record<string, string> = {
  planning: 'Planning',
  self_review: 'Self Review',
  manager_review: 'Manager Review',
  calibration: 'Calibration',
  approval: 'Approval',
  closed: 'Closed',
};

export const PERMISSION_KEYS = [
  'edit_kpi',
  'submit_self_review',
  'submit_manager_review',
  'approve',
  'edit_scores',
  'add_comments',
  'view_only',
] as const;

export const PERMISSION_LABELS: Record<string, string> = {
  edit_kpi: 'Edit KPI',
  submit_self_review: 'Self Review',
  submit_manager_review: 'Manager Review',
  approve: 'Approve',
  edit_scores: 'Edit Scores',
  add_comments: 'Comments',
  view_only: 'View Only',
};

export function useReviewPeriodGovernance(periodId: string | null) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: locks, isLoading: loadingLocks } = useQuery({
    queryKey: ['review-period-locks', periodId],
    queryFn: async () => {
      if (!periodId) return [];
      const { data, error } = await supabase
        .from('review_period_locks')
        .select('*')
        .eq('review_period_id', periodId);
      if (error) throw error;
      return (data || []) as ReviewPeriodLock[];
    },
    enabled: !!periodId,
  });

  const { data: stageHistory, isLoading: loadingStages } = useQuery({
    queryKey: ['review-period-stages', periodId],
    queryFn: async () => {
      if (!periodId) return [];
      const { data, error } = await supabase
        .from('review_period_stages')
        .select('*')
        .eq('review_period_id', periodId)
        .order('started_at', { ascending: true });
      if (error) throw error;
      return (data || []) as ReviewPeriodStageRecord[];
    },
    enabled: !!periodId,
  });

  const { data: auditLog, isLoading: loadingAudit } = useQuery({
    queryKey: ['review-period-audit-log', periodId],
    queryFn: async () => {
      if (!periodId) return [];
      const { data, error } = await supabase
        .from('review_period_audit_log')
        .select('*')
        .eq('review_period_id', periodId)
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data || []) as ReviewPeriodAuditEntry[];
    },
    enabled: !!periodId,
  });

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['review-period-locks', periodId] });
    queryClient.invalidateQueries({ queryKey: ['review-period-stages', periodId] });
    queryClient.invalidateQueries({ queryKey: ['review-period-audit-log', periodId] });
    queryClient.invalidateQueries({ queryKey: ['review-periods-admin'] });
  };

  const advanceStageMutation = useMutation({
    mutationFn: async ({ newStage, reason }: { newStage: string; reason?: string }) => {
      if (!periodId) throw new Error('No period selected');
      // Close current stage
      const { error: closeErr } = await supabase
        .from('review_period_stages')
        .update({ ended_at: new Date().toISOString() })
        .eq('review_period_id', periodId)
        .is('ended_at', null);
      if (closeErr) throw closeErr;

      // Create new stage record
      const { error: stageErr } = await supabase
        .from('review_period_stages')
        .insert({
          review_period_id: periodId,
          stage: newStage,
          started_by: user?.id,
        });
      if (stageErr) throw stageErr;

      // Update period
      const { error: periodErr } = await supabase
        .from('review_periods')
        .update({
          current_stage: newStage,
          stage_started_at: new Date().toISOString(),
        })
        .eq('id', periodId);
      if (periodErr) throw periodErr;

      // Audit log
      const { error: auditErr } = await supabase
        .from('review_period_audit_log')
        .insert({
          review_period_id: periodId,
          action: 'stage_changed',
          performed_by: user?.id,
          new_state: { stage: newStage },
          reason: reason || null,
        });
      if (auditErr) throw auditErr;
    },
    onSuccess: () => {
      invalidateAll();
      toast({ title: 'Stage updated successfully' });
    },
    onError: (err: Error) => {
      toast({ title: 'Failed to update stage', description: err.message, variant: 'destructive' });
    },
  });

  const upsertLockMutation = useMutation({
    mutationFn: async (lock: {
      lock_type: string;
      target_id?: string | null;
      permissions: Record<string, boolean>;
      is_locked: boolean;
      reason?: string;
    }) => {
      if (!periodId) throw new Error('No period selected');

      // Check if lock exists
      let query = supabase
        .from('review_period_locks')
        .select('id')
        .eq('review_period_id', periodId)
        .eq('lock_type', lock.lock_type);

      if (lock.target_id) {
        query = query.eq('target_id', lock.target_id);
      } else {
        query = query.is('target_id', null);
      }

      const { data: existing } = await query.maybeSingle();

      const previousState = existing
        ? (locks || []).find(l => l.id === existing.id)
        : null;

      if (existing) {
        const { error } = await supabase
          .from('review_period_locks')
          .update({
            permissions: lock.permissions,
            is_locked: lock.is_locked,
            locked_by: user?.id,
            locked_at: new Date().toISOString(),
            reason: lock.reason || null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('review_period_locks')
          .insert({
            review_period_id: periodId,
            lock_type: lock.lock_type,
            target_id: lock.target_id || null,
            permissions: lock.permissions,
            is_locked: lock.is_locked,
            locked_by: user?.id,
            reason: lock.reason || null,
          });
        if (error) throw error;
      }

      // Audit
      await supabase.from('review_period_audit_log').insert({
        review_period_id: periodId,
        action: lock.is_locked ? `${lock.lock_type}_locked` : `${lock.lock_type}_unlocked`,
        performed_by: user?.id,
        previous_state: previousState ? { permissions: previousState.permissions, is_locked: previousState.is_locked } : null,
        new_state: { permissions: lock.permissions, is_locked: lock.is_locked },
        reason: lock.reason || null,
        target_type: lock.lock_type,
        target_id: lock.target_id || null,
      });
    },
    onSuccess: () => {
      invalidateAll();
      toast({ title: 'Lock updated' });
    },
    onError: (err: Error) => {
      toast({ title: 'Failed to update lock', description: err.message, variant: 'destructive' });
    },
  });

  const deleteLockMutation = useMutation({
    mutationFn: async (lockId: string) => {
      if (!periodId) throw new Error('No period selected');
      const lockToDelete = (locks || []).find(l => l.id === lockId);
      const { error } = await supabase.from('review_period_locks').delete().eq('id', lockId);
      if (error) throw error;

      await supabase.from('review_period_audit_log').insert({
        review_period_id: periodId,
        action: 'lock_deleted',
        performed_by: user?.id,
        previous_state: lockToDelete ? { lock_type: lockToDelete.lock_type, target_id: lockToDelete.target_id } : null,
      });
    },
    onSuccess: () => {
      invalidateAll();
      toast({ title: 'Lock removed' });
    },
    onError: (err: Error) => {
      toast({ title: 'Failed to remove lock', description: err.message, variant: 'destructive' });
    },
  });

  return {
    locks: locks || [],
    stageHistory: stageHistory || [],
    auditLog: auditLog || [],
    loadingLocks,
    loadingStages,
    loadingAudit,
    advanceStage: advanceStageMutation.mutate,
    advancingStage: advanceStageMutation.isPending,
    upsertLock: upsertLockMutation.mutate,
    upsertingLock: upsertLockMutation.isPending,
    deleteLock: deleteLockMutation.mutate,
    deletingLock: deleteLockMutation.isPending,
    invalidateAll,
  };
}

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { useSystemSetting } from '@/hooks/useSystemSettings';

export function useRecallWindowHours() {
  const { data, isLoading } = useSystemSetting('self_review_recall_hours');

  let hours = 24; // Default 24 hours
  if (data?.setting_value) {
    const value = data.setting_value;
    if (typeof value === 'number') {
      hours = value;
    } else if (typeof value === 'string') {
      const cleaned = value.replace(/^"|"$/g, '');
      if (cleaned.toLowerCase() === 'disabled') return { hours: 0, isLoading };
      const parsed = parseInt(cleaned, 10);
      if (!isNaN(parsed)) hours = parsed;
    }
  }

  return { hours, isLoading };
}

interface RecallEligibility {
  canRecall: boolean;
  reason?: string;
  submittedAt?: string;
  expiresAt?: Date;
  remainingMs?: number;
}

export function useCanRecallSubmission(kpiId: string | undefined, kpiStatus: string | undefined, kpiEmployeeId: string | undefined) {
  const { profile } = useAuth();
  const { hours, isLoading: hoursLoading } = useRecallWindowHours();

  return useQuery<RecallEligibility>({
    queryKey: ['recall-eligibility', kpiId, hours],
    queryFn: async () => {
      if (!kpiId || !profile?.id) return { canRecall: false, reason: 'Missing data' };

      // Check 1: KPI status must be self_review
      if (kpiStatus !== 'self_review') return { canRecall: false, reason: 'KPI is not in self-review status' };

      // Check 2: Current user is the KPI owner
      if (kpiEmployeeId !== profile.id) return { canRecall: false, reason: 'You are not the owner of this KPI' };

      // Check 3: Feature is disabled
      if (hours === 0) return { canRecall: false, reason: 'Recall feature is disabled' };

      // Check 4: Find the last SELF_REVIEW_SUBMITTED audit log
      const { data: auditLog, error: auditError } = await supabase
        .from('kpi_audit_logs')
        .select('created_at')
        .eq('kpi_id', kpiId)
        .eq('action', 'SELF_REVIEW_SUBMITTED')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (auditError) throw auditError;
      if (!auditLog) return { canRecall: false, reason: 'No submission record found' };

      const submittedAt = new Date(auditLog.created_at);
      const expiresAt = new Date(submittedAt.getTime() + hours * 60 * 60 * 1000);
      const now = new Date();

      if (now > expiresAt) return { canRecall: false, reason: 'Recall window has expired' };

      // Check 5: Manager hasn't acted (no manager score/remarks)
      const { data: submission } = await supabase
        .from('review_submissions')
        .select('manager_score, manager_remarks')
        .eq('kpi_id', kpiId)
        .maybeSingle();

      if (submission?.manager_score != null || (submission?.manager_remarks && submission.manager_remarks.trim() !== '')) {
        return { canRecall: false, reason: 'Manager has already reviewed this KPI' };
      }

      return {
        canRecall: true,
        submittedAt: auditLog.created_at,
        expiresAt,
        remainingMs: expiresAt.getTime() - now.getTime(),
      };
    },
    enabled: !!kpiId && !!profile?.id && !hoursLoading && kpiStatus === 'self_review',
    refetchInterval: 60_000, // Refresh every minute for countdown
  });
}

export function useRecallSubmission() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (kpiId: string) => {
      if (!profile?.id) throw new Error('Not authenticated');

      // 1. Update KPI status back to kra_set
      const { error: kpiError } = await supabase
        .from('kpis')
        .update({ status: 'kra_set' })
        .eq('id', kpiId)
        .eq('employee_id', profile.id)
        .eq('status', 'self_review');

      if (kpiError) throw kpiError;

      // 2. Clear self-review fields in review_submissions
      const { error: subError } = await supabase
        .from('review_submissions')
        .update({
          achieved_value: null,
          self_score: null,
          self_rating: null,
          self_remarks: null,
          self_evidence_url: null,
          self_evidence_urls: null,
        })
        .eq('kpi_id', kpiId);

      if (subError) throw subError;

      // 3. Log the recall action
      const { error: logError } = await supabase
        .from('kpi_audit_logs')
        .insert({
          kpi_id: kpiId,
          action: 'SELF_REVIEW_RECALLED',
          performed_by: profile.id,
          new_value: { status: 'kra_set' } as any,
          old_value: { status: 'self_review' } as any,
        });

      if (logError) throw logError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kpis'] });
      queryClient.invalidateQueries({ queryKey: ['review-submissions'] });
      queryClient.invalidateQueries({ queryKey: ['recall-eligibility'] });
      queryClient.invalidateQueries({ queryKey: ['kpi-timeline'] });
      toast({
        title: 'Submission Recalled',
        description: 'Your self-review has been withdrawn. You can now edit and resubmit.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Recall Failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

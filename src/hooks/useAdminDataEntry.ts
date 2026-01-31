import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import type { Database } from '@/integrations/supabase/types';

type RatingLevel = Database['public']['Enums']['rating_level'];

// ========== Types ==========

export type AdminRoleLevel = 'self' | 'manager' | 'auditor' | 'management';

export interface AdminDataEntryParams {
  kpi_id: string;
  employee_id: string;
  role_level: AdminRoleLevel;
  achieved_value?: number | null;
  rating?: RatingLevel | null;
  score?: number | null;
  remarks?: string | null;
  evidence_url?: string | null;
  reason: string; // Mandatory for audit
  kpi_name: string; // For notification message
}

export interface AdminSubPeriodParams {
  kpi_id: string;
  employee_id: string;
  sub_period_type: 'daily' | 'weekly';
  sub_period_value: string; // Date string YYYY-MM-DD or week identifier
  achieved_value: number | null;
  remarks?: string | null;
  reason: string; // Mandatory for audit
  review_month: string;
  review_year: number;
  kpi_name: string; // For notification message
}

// ========== Helper Functions ==========

function buildUpdateFields(
  roleLevel: AdminRoleLevel,
  data: {
    achieved_value?: number | null;
    rating?: RatingLevel | null;
    score?: number | null;
    remarks?: string | null;
    evidence_url?: string | null;
  }
): Record<string, unknown> {
  const prefix = roleLevel === 'self' ? '' : `${roleLevel}_`;
  const fields: Record<string, unknown> = {};

  // Handle achieved_value field naming
  if (data.achieved_value !== undefined) {
    if (roleLevel === 'self') {
      fields.achieved_value = data.achieved_value;
    } else {
      fields[`${roleLevel}_achieved_value`] = data.achieved_value;
    }
  }

  // Handle rating
  if (data.rating !== undefined) {
    fields[roleLevel === 'self' ? 'self_rating' : `${roleLevel}_rating`] = data.rating;
  }

  // Handle score
  if (data.score !== undefined) {
    fields[roleLevel === 'self' ? 'self_score' : `${roleLevel}_score`] = data.score;
  }

  // Handle remarks
  if (data.remarks !== undefined) {
    fields[roleLevel === 'self' ? 'self_remarks' : `${roleLevel}_remarks`] = data.remarks;
  }

  // Handle evidence
  if (data.evidence_url !== undefined) {
    fields[roleLevel === 'self' ? 'self_evidence_url' : `${roleLevel}_evidence_url`] = data.evidence_url;
  }

  return fields;
}

// ========== Hooks ==========

/**
 * Hook for admin to submit/update review submission data for any role level.
 * Bypasses all normal restrictions and creates full audit trail.
 */
export function useAdminSubmitReviewData() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({
      kpi_id,
      employee_id,
      role_level,
      achieved_value,
      rating,
      score,
      remarks,
      evidence_url,
      reason,
      kpi_name,
    }: AdminDataEntryParams) => {
      if (!user?.id) throw new Error('User not authenticated');

      // 1. Get current submission state for audit
      const { data: oldSubmission } = await supabase
        .from('review_submissions')
        .select('*')
        .eq('kpi_id', kpi_id)
        .maybeSingle();

      // 2. Build update object based on role_level
      const updateFields = buildUpdateFields(role_level, {
        achieved_value,
        rating,
        score,
        remarks,
        evidence_url,
      });

      // 3. Upsert submission
      const { data: newSubmission, error } = await supabase
        .from('review_submissions')
        .upsert(
          { 
            kpi_id, 
            ...updateFields,
            updated_at: new Date().toISOString(),
          }, 
          { onConflict: 'kpi_id' }
        )
        .select()
        .single();

      if (error) throw error;

      // 4. Create audit log with on-behalf info
      const { error: auditError } = await supabase.from('kpi_audit_logs').insert({
        kpi_id,
        action: `ADMIN_DATA_ENTRY_${role_level.toUpperCase()}`,
        performed_by: user.id,
        on_behalf_of: employee_id,
        on_behalf_role: role_level,
        old_value: oldSubmission || null,
        new_value: newSubmission,
        metadata: {
          reason,
          source: 'admin_data_entry_dialog',
          fields_updated: Object.keys(updateFields),
        },
      });

      if (auditError) {
        console.error('Failed to create audit log:', auditError);
      }

      // 5. Notify the affected employee
      const { error: notifyError } = await supabase.from('notifications').insert({
        user_id: employee_id,
        type: 'admin_data_entry',
        title: 'KPI Data Updated by Admin',
        message: `Admin entered ${role_level} data for KPI: ${kpi_name}. Reason: ${reason}`,
        kpi_id,
        related_user_id: user.id,
        metadata: { role_level, reason },
      });

      if (notifyError) {
        console.error('Failed to create notification:', notifyError);
      }

      return newSubmission;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['review-submissions'] });
      queryClient.invalidateQueries({ queryKey: ['kpis'] });
      queryClient.invalidateQueries({ queryKey: ['all-kpis'] });
      toast({ 
        title: 'Data entered successfully', 
        description: 'Audit log created and employee notified.' 
      });
    },
    onError: (error) => {
      console.error('Admin data entry failed:', error);
      toast({ 
        title: 'Failed to save data', 
        description: error.message,
        variant: 'destructive' 
      });
    },
  });
}

/**
 * Hook for admin to submit daily/weekly sub-period data.
 * Bypasses ALL date restrictions and resubmission locks.
 */
export function useAdminSubmitSubPeriod() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({
      kpi_id,
      employee_id,
      sub_period_type,
      sub_period_value,
      achieved_value,
      remarks,
      reason,
      review_month,
      review_year,
      kpi_name,
    }: AdminSubPeriodParams) => {
      if (!user?.id) throw new Error('User not authenticated');

      // 1. Get existing submission for audit trail
      const { data: existing } = await supabase
        .from('sub_period_submissions')
        .select('*')
        .eq('kpi_id', kpi_id)
        .eq('sub_period_value', sub_period_value)
        .eq('review_month', review_month)
        .eq('review_year', review_year)
        .maybeSingle();

      // Track what restrictions we're bypassing
      const bypassedRestrictions: string[] = ['date_window'];
      if (existing?.is_resubmitted) {
        bypassedRestrictions.push('resubmission_lock');
      }

      // 2. Admin can override is_resubmitted lock
      // Use upsert with NO date validation
      const { data, error } = await supabase
        .from('sub_period_submissions')
        .upsert(
          {
            kpi_id,
            sub_period_type,
            sub_period_value,
            achieved_value,
            remarks,
            review_month,
            review_year,
            submitted_by: employee_id, // Still track as employee's data
            submitted_at: new Date().toISOString(),
            // Reset resubmission flag so data can be edited again if needed
            is_resubmitted: false,
            update_reason: `Admin override: ${reason}`,
          },
          {
            onConflict: 'kpi_id,sub_period_type,sub_period_value,review_month,review_year',
          }
        )
        .select()
        .single();

      if (error) throw error;

      // 3. Create audit log with admin context
      const { error: auditError } = await supabase.from('kpi_audit_logs').insert({
        kpi_id,
        action: 'ADMIN_DAILY_ENTRY_OVERRIDE',
        performed_by: user.id,
        on_behalf_of: employee_id,
        on_behalf_role: 'daily_submission',
        old_value: existing || null,
        new_value: data,
        metadata: {
          reason,
          sub_period_value,
          sub_period_type,
          review_month,
          review_year,
          bypassed_restrictions: bypassedRestrictions,
        },
      });

      if (auditError) {
        console.error('Failed to create audit log:', auditError);
      }

      // 4. Notify employee
      const { error: notifyError } = await supabase.from('notifications').insert({
        user_id: employee_id,
        type: 'admin_data_override',
        title: 'Daily Data Updated by Admin',
        message: `Admin updated your daily entry for ${sub_period_value} on KPI: ${kpi_name}. Reason: ${reason}`,
        kpi_id,
        related_user_id: user.id,
        metadata: {
          sub_period_value,
          reason,
          bypassed_restrictions: bypassedRestrictions,
        },
      });

      if (notifyError) {
        console.error('Failed to create notification:', notifyError);
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sub-period-submissions'] });
      queryClient.invalidateQueries({ queryKey: ['kpis'] });
      toast({ 
        title: 'Daily data updated', 
        description: 'Audit log created and employee notified.' 
      });
    },
    onError: (error) => {
      console.error('Admin sub-period entry failed:', error);
      toast({ 
        title: 'Failed to save data', 
        description: error.message,
        variant: 'destructive' 
      });
    },
  });
}

/**
 * Hook to fetch existing review submission for a KPI
 */
export function useReviewSubmission(kpiId: string | null) {
  return {
    queryKey: ['review-submission', kpiId],
    queryFn: async () => {
      if (!kpiId) return null;
      const { data, error } = await supabase
        .from('review_submissions')
        .select('*')
        .eq('kpi_id', kpiId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!kpiId,
  };
}

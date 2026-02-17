import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { resolveForwardStatus } from '@/lib/workflowEngine';
import type { Database } from '@/integrations/supabase/types';

type RatingLevel = Database['public']['Enums']['rating_level'];

// ========== Types ==========

export type AdminRoleLevel = 'self' | 'manager' | 'skip_level' | 'hr_pms' | 'auditor' | 'management';

export interface AdminDataEntryParams {
  kpi_id: string;
  employee_id: string;
  role_level: AdminRoleLevel;
  achieved_value?: number | null;
  rating?: RatingLevel | null;
  score?: number | null;
  remarks?: string | null;
  evidence_url?: string | null;
  is_na?: boolean; // Explicit N/A toggle
  reason: string; // Mandatory for audit
  kpi_name: string; // For notification message
  advance_status?: boolean; // Default true — advance KPI workflow status after data entry
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
      is_na,
      reason,
      kpi_name,
      advance_status,
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

      // 2b. Handle is_na flag: explicit toggle takes priority,
      // otherwise auto-clear when achieved_value is provided
      if (is_na !== undefined) {
        updateFields.is_na = is_na;
      } else if (achieved_value !== undefined && achieved_value !== null) {
        updateFields.is_na = false;
      }

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

      // 6. Optionally advance KPI workflow status
      if (advance_status !== false) {
        let newStatus: string | null = null;

        if (role_level === 'self') {
          newStatus = 'self_review';
        } else {
          // Fetch employee's workflow stages to determine correct forward status
          const { data: stagesData } = await supabase
            .rpc('get_employee_workflow', { employee_uuid: employee_id });
          const stages = (stagesData as string[]) || undefined;
          newStatus = resolveForwardStatus(role_level, stages);
        }

        if (newStatus) {
          const { error: statusError } = await supabase
            .from('kpis')
            .update({ status: newStatus as any, updated_at: new Date().toISOString() })
            .eq('id', kpi_id);

          if (statusError) {
            console.error('Failed to advance KPI status:', statusError);
          }

          // Also sync review_submissions.kpi_status to 'submitted'
          await supabase
            .from('review_submissions')
            .update({ kpi_status: 'submitted' as any, updated_at: new Date().toISOString() })
            .eq('kpi_id', kpi_id);
        }
      }

      return newSubmission;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['review-submission-admin'] });
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

// ========== Status Step-Back ==========

// Full 8-stage order for cascade-clearing. Any employee's workflow is a subset of this.
const FULL_STATUS_ORDER: Array<Database['public']['Enums']['review_status']> = [
  'kra_set',
  'self_review',
  'manager_check',
  'skip_level_check',
  'hr_pms_review',
  'audit',
  'management_review',
  'approved',
];

export function getPreviousStatus(
  current: Database['public']['Enums']['review_status'],
  workflowStages?: string[]
): Database['public']['Enums']['review_status'] | null {
  const stages = (workflowStages || FULL_STATUS_ORDER) as Array<Database['public']['Enums']['review_status']>;
  const idx = stages.indexOf(current);
  return idx > 0 ? stages[idx - 1] : null;
}

interface AdminStepBackParams {
  kpi_id: string;
  employee_id: string;
  current_status: Database['public']['Enums']['review_status'];
  target_status: Database['public']['Enums']['review_status'];
  reason: string;
  kpi_name: string;
}

/**
 * Hook for admin to move a KPI's workflow status one step backward.
 * Creates audit trail and notifies the employee.
 */
export function useAdminStatusStepBack() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({
      kpi_id,
      employee_id,
      current_status,
      target_status,
      reason,
      kpi_name,
    }: AdminStepBackParams) => {
      if (!user?.id) throw new Error('User not authenticated');

      // 1. Update KPI status
      const { data, error } = await supabase
        .from('kpis')
        .update({ status: target_status, updated_at: new Date().toISOString() })
        .eq('id', kpi_id)
        .select()
        .single();

      if (error) throw error;

      // 2. Clear downstream review data based on target_status using index-based clearing
      const clearFields: Record<string, unknown> = { updated_at: new Date().toISOString() };
      const targetIdx = FULL_STATUS_ORDER.indexOf(target_status);

      // When stepping back to kra_set, also reset kpi_status so employee can resubmit
      if (target_status === 'kra_set') {
        clearFields.kpi_status = 'open';
      }

      // Clear self fields if target is before self_review
      if (targetIdx < FULL_STATUS_ORDER.indexOf('self_review')) {
        clearFields.self_rating = null;
        clearFields.self_score = null;
        clearFields.self_remarks = null;
        clearFields.self_evidence_url = null;
        clearFields.achieved_value = null;
      }

      // Clear manager fields if target is before manager_check
      if (targetIdx < FULL_STATUS_ORDER.indexOf('manager_check')) {
        clearFields.manager_rating = null;
        clearFields.manager_score = null;
        clearFields.manager_remarks = null;
        clearFields.manager_evidence_url = null;
        clearFields.manager_achieved_value = null;
      }

      // Clear skip-level fields if target is before skip_level_check
      if (targetIdx < FULL_STATUS_ORDER.indexOf('skip_level_check')) {
        clearFields.skip_level_rating = null;
        clearFields.skip_level_score = null;
        clearFields.skip_level_remarks = null;
        clearFields.skip_level_evidence_url = null;
        clearFields.skip_level_achieved_value = null;
      }

      // Clear HR PMS fields if target is before hr_pms_review
      if (targetIdx < FULL_STATUS_ORDER.indexOf('hr_pms_review')) {
        clearFields.hr_pms_rating = null;
        clearFields.hr_pms_score = null;
        clearFields.hr_pms_remarks = null;
        clearFields.hr_pms_evidence_url = null;
        clearFields.hr_pms_achieved_value = null;
      }

      // Clear auditor fields if target is before audit
      if (targetIdx < FULL_STATUS_ORDER.indexOf('audit')) {
        clearFields.auditor_rating = null;
        clearFields.auditor_score = null;
        clearFields.auditor_remarks = null;
        clearFields.auditor_evidence_url = null;
        clearFields.auditor_achieved_value = null;
      }

      // Clear management fields if target is before management_review
      if (targetIdx < FULL_STATUS_ORDER.indexOf('management_review')) {
        clearFields.management_rating = null;
        clearFields.management_score = null;
        clearFields.management_remarks = null;
        clearFields.management_evidence_url = null;
        clearFields.management_achieved_value = null;
      }

      // Always clear final fields when stepping back
      if (target_status !== 'approved') {
        clearFields.final_rating = null;
        clearFields.final_score = null;
      }

      const { error: subError } = await supabase
        .from('review_submissions')
        .update(clearFields)
        .eq('kpi_id', kpi_id);

      if (subError) {
        console.error('Failed to clear downstream review data:', subError);
      }

      // 2b. Create a kpi_queries entry so the reason is visible in the Review Journey
      const { error: queryError } = await supabase.from('kpi_queries').insert({
        kpi_id,
        raised_by: user.id,
        raised_to: employee_id,
        reason: `[ADMIN SENT BACK] ${reason}`,
        entity_type: 'kpi' as const,
        status: 'resolved' as const,
        resolved_at: new Date().toISOString(),
        query_type: 'send_back',
      });

      if (queryError) {
        console.error('Failed to create kpi_queries entry:', queryError);
      }

      // 3. Insert audit log
      const { error: auditError } = await supabase.from('kpi_audit_logs').insert({
        kpi_id,
        action: 'ADMIN_STATUS_STEP_BACK',
        performed_by: user.id,
        on_behalf_of: employee_id,
        on_behalf_role: 'admin',
        old_value: { status: current_status } as any,
        new_value: { status: target_status } as any,
        metadata: {
          reason,
          source: 'admin_status_step_back',
          from_status: current_status,
          to_status: target_status,
        },
      });

      if (auditError) console.error('Failed to create audit log:', auditError);

      // 3. Notify employee
      const { error: notifyError } = await supabase.from('notifications').insert({
        user_id: employee_id,
        type: 'admin_status_step_back',
        title: 'KPI Status Moved Back by Admin',
        message: `Admin moved your KPI "${kpi_name}" from ${current_status} back to ${target_status}. Reason: ${reason}`,
        kpi_id,
        related_user_id: user.id,
        metadata: { reason, from_status: current_status, to_status: target_status },
      });

      if (notifyError) console.error('Failed to create notification:', notifyError);

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['all-kpis'] });
      queryClient.invalidateQueries({ queryKey: ['kpis'] });
      queryClient.invalidateQueries({ queryKey: ['review-submissions'] });
      toast({
        title: 'Status stepped back',
        description: 'Audit log created and employee notified.',
      });
    },
    onError: (error) => {
      console.error('Admin status step-back failed:', error);
      toast({
        title: 'Failed to step back status',
        description: error.message,
        variant: 'destructive',
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

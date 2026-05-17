import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { resolveForwardStatus, hasStage } from '@/lib/workflowEngine';
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
  evidence_urls?: string[] | null;
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
    evidence_urls?: string[] | null;
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

  // Handle evidence (multi-file)
  if (data.evidence_urls !== undefined && data.evidence_urls !== null) {
    fields[roleLevel === 'self' ? 'self_evidence_urls' : `${roleLevel}_evidence_urls`] = data.evidence_urls;
    // Sync legacy single-url column with the most recent upload
    fields[roleLevel === 'self' ? 'self_evidence_url' : `${roleLevel}_evidence_url`] =
      data.evidence_urls.length > 0 ? data.evidence_urls[data.evidence_urls.length - 1] : null;
  } else if (data.evidence_url !== undefined) {
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
      evidence_urls,
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
        evidence_urls,
      });

      // 2b. Handle is_na flag: explicit toggle takes priority,
      // otherwise auto-clear when achieved_value is provided.
      // CRITICAL: Only clear the CURRENT role's fields — never wipe other levels' scores.
      if (is_na !== undefined) {
        const oldIsNa = oldSubmission?.is_na === true;
        // Only write is_na when it actually changed to prevent accidental re-clears
        if (is_na !== oldIsNa) {
          updateFields.is_na = is_na;
          updateFields.na_marked_by_role = is_na ? 'admin' : null;
          if (is_na) {
            // Clear only the CURRENT role's fields + final score
            const roleClearFields = buildUpdateFields(role_level, {
              achieved_value: null,
              rating: null,
              score: null,
              remarks: null,
            });
            Object.assign(updateFields, roleClearFields);
            updateFields.final_score = null;
            updateFields.final_rating = null;
          }
        }
      } else if (achieved_value !== undefined && achieved_value !== null) {
        updateFields.is_na = false;
      }

      // 3. Resolve workflow status BEFORE upsert so we can include final_score atomically
      let newStatus: string | null = null;
      // Hoist currentKpiStatus to outer scope — needed for post-upsert final_score recompute
      let currentKpiStatus: string | null = null;

      if (advance_status !== false) {
        if (role_level === 'self') {
          const { data: currentKpi } = await supabase
            .from('kpis')
            .select('status')
            .eq('id', kpi_id)
            .single();

          const STAGE_ORDER = [
            'kra_set', 'self_review', 'manager_check', 'skip_level_check',
            'hr_pms_review', 'audit', 'management_review', 'approved',
          ];
          const currentStatus = currentKpi?.status || 'kra_set';
          currentKpiStatus = currentStatus;
          const currentIdx = STAGE_ORDER.indexOf(currentStatus);
          const selfReviewIdx = STAGE_ORDER.indexOf('self_review');

          if (currentIdx < selfReviewIdx) {
            newStatus = 'self_review';
          }
        } else {
          const { data: kpiPeriod } = await supabase
            .from('kpis')
            .select('status, review_period, review_year')
            .eq('id', kpi_id)
            .single();

          currentKpiStatus = kpiPeriod?.status || 'kra_set';
          if (currentKpiStatus === 'approved') {
            console.info('[AdminDataEntry] KPI already approved — skipping status advancement');
            newStatus = null;
          } else {
            const rpcParams: Record<string, unknown> = { employee_uuid: employee_id };
            if (kpiPeriod?.review_period && kpiPeriod?.review_year) {
              rpcParams.p_review_period = kpiPeriod.review_period;
              rpcParams.p_review_year = kpiPeriod.review_year;
            }

            const { data: stagesData } = await supabase
              .rpc('get_employee_workflow', rpcParams as any);
            const stages = (stagesData as string[]) || undefined;

            const ROLE_TO_STAGE: Record<string, string> = {
              manager: 'manager_check',
              skip_level: 'skip_level_check',
              hr_pms: 'hr_pms_review',
              auditor: 'audit',
              management: 'management_review',
            };
            const requiredStage = ROLE_TO_STAGE[role_level];
            if (requiredStage && stages && !stages.includes(requiredStage)) {
              console.info(`[AdminDataEntry] Role "${role_level}" (stage "${requiredStage}") not in employee workflow [${stages.join(',')}] — skipping status advancement`);
              newStatus = null;
            } else {
              newStatus = resolveForwardStatus(role_level, stages);
            }
          }
        }
      } else if (role_level !== 'self') {
        // Even when advance_status is off, fetch current KPI status for final_score recompute
        const { data: kpiPeriod } = await supabase
          .from('kpis')
          .select('status')
          .eq('id', kpi_id)
          .single();
        currentKpiStatus = kpiPeriod?.status || 'kra_set';
      }

      // 3b. If advancing to approved, include final_score/final_rating atomically in the upsert
      if (newStatus === 'approved') {
        updateFields.final_score = score !== null && score !== undefined ? score : null;
        updateFields.final_rating = rating || null;
        updateFields.kpi_status = 'submitted';
      }

      // 4. Upsert submission (single atomic write including final_score when approving)
      const { data: newSubmission, error } = await supabase
        .from('review_submissions')
        .upsert(
          { 
            kpi_id, 
            ...updateFields,
            auto_advance_reason: `Scored by Admin on behalf of ${role_level}`,
            updated_at: new Date().toISOString(),
          }, 
          { onConflict: 'kpi_id' }
        )
        .select()
        .single();

      if (error) throw error;

      // 5. Create audit log with on-behalf info
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

      // 6. Notify the affected employee
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

      // 7. Advance KPI workflow status
      if (newStatus) {
        const { error: statusError } = await supabase
          .from('kpis')
          .update({ status: newStatus as any, updated_at: new Date().toISOString() })
          .eq('id', kpi_id);

        if (statusError) {
          console.error('Failed to advance KPI status:', statusError);
        }

        // For non-approved statuses, update kpi_status to submitted
        if (newStatus !== 'approved') {
          await supabase
            .from('review_submissions')
            .update({ kpi_status: 'submitted' as any, updated_at: new Date().toISOString() })
            .eq('kpi_id', kpi_id);
        }
      }

      // 8. Recompute final_score for approved KPIs (handles both new approvals and edits on already-approved)
      // Decoupled from advance_status — already-approved KPIs always need final_score sync
      const kpiWasAlreadyApproved = !newStatus && currentKpiStatus === 'approved';
      const shouldRecomputeFinal = newStatus === 'approved' || (kpiWasAlreadyApproved && !!newSubmission);
      if (shouldRecomputeFinal && newSubmission) {
        // Re-fetch the full submission to get all latest scores after upsert
        const { data: freshSub } = await supabase
          .from('review_submissions')
          .select('*')
          .eq('kpi_id', kpi_id)
          .single();

        if (freshSub) {
          // Guard: If N/A was set, force final_score to null — skip fallback chain
          if (freshSub.is_na === true) {
            if (freshSub.final_score !== null) {
              const { error: naPatchError } = await supabase
                .from('review_submissions')
                .update({ final_score: null, final_rating: null, updated_at: new Date().toISOString() })
                .eq('kpi_id', kpi_id);
              if (naPatchError) {
                console.error('[AdminDataEntry] N/A final_score clear failed:', naPatchError);
              } else {
                console.info('[AdminDataEntry] N/A guard: cleared final_score to null');
              }
            }
          } else {
            const currentFinal = freshSub.final_score;
            const fallbackChain = [
              'management_score', 'auditor_score', 'hr_pms_score',
              'skip_level_score', 'manager_score', 'self_score',
            ] as const;
            const fallbackRatingChain = [
              'management_rating', 'auditor_rating', 'hr_pms_rating',
              'skip_level_rating', 'manager_rating', 'self_rating',
            ] as const;

            let computedScore: number | null = null;
            let computedRating: string | null = null;
            for (let i = 0; i < fallbackChain.length; i++) {
              const s = (freshSub as any)[fallbackChain[i]];
              if (s !== null && s !== undefined) {
                computedScore = s;
                computedRating = (freshSub as any)[fallbackRatingChain[i]] || null;
                break;
              }
            }

            // Patch if computed differs from current OR if current is null
            if (computedScore !== null && (currentFinal === null || currentFinal === undefined || currentFinal !== computedScore)) {
              const { error: patchError } = await supabase
                .from('review_submissions')
                .update({
                  final_score: computedScore,
                  final_rating: computedRating as any,
                  updated_at: new Date().toISOString(),
                })
                .eq('kpi_id', kpi_id);

              if (patchError) {
                console.error('[AdminDataEntry] final_score recomputation patch failed:', patchError);
              } else {
                console.info(`[AdminDataEntry] final_score recomputed: ${currentFinal} → ${computedScore}`);
              }
            }
          }
        }
      }

      return newSubmission;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['review-submission-admin'] });
      queryClient.invalidateQueries({ queryKey: ['review-submissions'] });
      queryClient.invalidateQueries({ queryKey: ['kpis'] });
      queryClient.invalidateQueries({ queryKey: ['all-kpis'] });
      queryClient.invalidateQueries({ queryKey: ['kpis-by-period'] });
      queryClient.invalidateQueries({ queryKey: ['my-kpis'] });
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
      queryClient.invalidateQueries({ queryKey: ['kpis-by-period'] });
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
export const FULL_STATUS_ORDER: Array<Database['public']['Enums']['review_status']> = [
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
  // If status not found in employee's workflow, walk backward
  // through the full order to find the nearest stage that IS
  // in the employee's workflow
  if (idx === -1 && workflowStages) {
    const fullIdx = FULL_STATUS_ORDER.indexOf(current);
    for (let i = fullIdx - 1; i >= 0; i--) {
      if (workflowStages.includes(FULL_STATUS_ORDER[i])) {
        return FULL_STATUS_ORDER[i] as Database['public']['Enums']['review_status'];
      }
    }
    return null;
  }
  return idx > 0 ? stages[idx - 1] : null;
}

/**
 * POLICY §117 — Step-Back Target Composition.
 *
 * Compute the union of (a) workflow-template stages strictly before `current`,
 * and (b) any stage with persisted scoring data in `review_submissions` that is
 * strictly before `current`. Stages that exist only because of recorded data
 * (i.e. not in the active workflow template) are flagged as `historic` so the
 * UI can surface that distinction to the admin.
 *
 * `kra_set` is always included as a baseline reset target. Result is sorted by
 * `FULL_STATUS_ORDER` for canonical ordering regardless of the workflow shape.
 */
export function computeStepBackTargets(
  current: Database['public']['Enums']['review_status'],
  workflowStages: string[] | undefined,
  dataBearingStages: Array<Database['public']['Enums']['review_status']>
): Array<{ stage: Database['public']['Enums']['review_status']; historic: boolean }> {
  const fullIdx = FULL_STATUS_ORDER.indexOf(current);
  if (fullIdx <= 0) return [];

  const inWorkflow = new Set<string>(workflowStages ?? FULL_STATUS_ORDER);
  const dataSet = new Set<string>(dataBearingStages);

  const out: Array<{
    stage: Database['public']['Enums']['review_status'];
    historic: boolean;
  }> = [{ stage: 'kra_set', historic: false }];

  for (let i = 0; i < fullIdx; i++) {
    const stage = FULL_STATUS_ORDER[i];
    if (stage === 'kra_set') continue;
    const inWf = inWorkflow.has(stage);
    const hasData = dataSet.has(stage);
    if (inWf || hasData) {
      out.push({ stage, historic: !inWf && hasData });
    }
  }
  return out;
}

/**
 * POLICY §117 — Default step-back target.
 *
 * Prefer the immediately-prior data-bearing stage when one exists, so an
 * approved KPI with `auditor_score` defaults back to Audit Review instead of
 * skipping over the recorded score.
 */
export function getDataAwareDefaultTarget(
  current: Database['public']['Enums']['review_status'],
  dataBearingStages: Array<Database['public']['Enums']['review_status']>
): Database['public']['Enums']['review_status'] | null {
  if (!dataBearingStages || dataBearingStages.length === 0) return null;
  const fullIdx = FULL_STATUS_ORDER.indexOf(current);
  if (fullIdx <= 0) return null;
  for (let i = fullIdx - 1; i >= 0; i--) {
    const s = FULL_STATUS_ORDER[i];
    if (dataBearingStages.includes(s)) return s;
  }
  return null;
}

/**
 * POLICY §117 — Preferred default step-back target derived ONLY from the
 * already-composed `availableTargets`. This guarantees the dropdown's selected
 * value can never disagree with its option list (e.g. defaulting to a stale
 * `hr_pms_review` while the resolved list correctly omits it).
 *
 * Preference order:
 *  1. Nearest prior data-bearing stage that is also in `availableTargets`.
 *  2. Nearest prior workflow/template stage in `availableTargets` (last entry
 *     before `current` in canonical order).
 *  3. `kra_set` (always present as baseline).
 */
export function getPreferredStepBackTarget(
  current: Database['public']['Enums']['review_status'],
  availableTargets: Array<{ stage: Database['public']['Enums']['review_status']; historic: boolean }>,
  dataBearingStages: Array<Database['public']['Enums']['review_status']>
): Database['public']['Enums']['review_status'] | null {
  if (!availableTargets || availableTargets.length === 0) return null;
  const inTargets = new Set(availableTargets.map(t => t.stage));
  const fullIdx = FULL_STATUS_ORDER.indexOf(current);
  if (fullIdx <= 0) return null;

  for (let i = fullIdx - 1; i >= 0; i--) {
    const s = FULL_STATUS_ORDER[i];
    if (dataBearingStages.includes(s) && inTargets.has(s)) return s;
  }
  for (let i = fullIdx - 1; i >= 0; i--) {
    const s = FULL_STATUS_ORDER[i];
    if (inTargets.has(s)) return s;
  }
  return 'kra_set';
}

interface AdminStepBackParams {
  kpi_id: string;
  employee_id: string;
  current_status: Database['public']['Enums']['review_status'];
  target_status: Database['public']['Enums']['review_status'];
  reason: string;
  kpi_name: string;
  full_reset?: boolean;
  revert_siblings?: boolean;
}

/**
 * Build the full-reset clear fields: nullifies every score/rating/remark/evidence/achieved value
 */
function buildFullResetFields(): Record<string, unknown> {
  return {
    updated_at: new Date().toISOString(),
    kpi_status: 'open',
    self_score: null, self_rating: null, self_remarks: null, self_evidence_url: null, self_evidence_urls: null,
    achieved_value: null,
    manager_score: null, manager_rating: null, manager_remarks: null, manager_evidence_url: null, manager_evidence_urls: null, manager_achieved_value: null,
    skip_level_score: null, skip_level_rating: null, skip_level_remarks: null, skip_level_evidence_url: null, skip_level_evidence_urls: null, skip_level_achieved_value: null,
    hr_pms_score: null, hr_pms_rating: null, hr_pms_remarks: null, hr_pms_evidence_url: null, hr_pms_evidence_urls: null, hr_pms_achieved_value: null,
    auditor_score: null, auditor_rating: null, auditor_remarks: null, auditor_evidence_url: null, auditor_evidence_urls: null, auditor_achieved_value: null,
    management_score: null, management_rating: null, management_remarks: null, management_evidence_url: null, management_evidence_urls: null, management_achieved_value: null,
    final_score: null, final_rating: null,
    auto_advance_reason: null,
  };
}

/**
 * Build cascade-clear fields based on target status index.
 */
function buildCascadeClearFields(target_status: Database['public']['Enums']['review_status']): Record<string, unknown> {
  const clearFields: Record<string, unknown> = { updated_at: new Date().toISOString() };
  const targetIdx = FULL_STATUS_ORDER.indexOf(target_status);

  if (target_status === 'kra_set') {
    clearFields.kpi_status = 'open';
  }

  if (targetIdx < FULL_STATUS_ORDER.indexOf('self_review')) {
    clearFields.self_rating = null; clearFields.self_score = null; clearFields.self_remarks = null;
    clearFields.self_evidence_url = null; clearFields.self_evidence_urls = null; clearFields.achieved_value = null;
    clearFields.auto_advance_reason = null;
  }
  if (targetIdx <= FULL_STATUS_ORDER.indexOf('manager_check')) {
    clearFields.manager_rating = null; clearFields.manager_score = null; clearFields.manager_remarks = null;
    clearFields.manager_evidence_url = null; clearFields.manager_evidence_urls = null; clearFields.manager_achieved_value = null;
  }
  if (targetIdx <= FULL_STATUS_ORDER.indexOf('skip_level_check')) {
    clearFields.skip_level_rating = null; clearFields.skip_level_score = null; clearFields.skip_level_remarks = null;
    clearFields.skip_level_evidence_url = null; clearFields.skip_level_evidence_urls = null; clearFields.skip_level_achieved_value = null;
  }
  if (targetIdx <= FULL_STATUS_ORDER.indexOf('hr_pms_review')) {
    clearFields.hr_pms_rating = null; clearFields.hr_pms_score = null; clearFields.hr_pms_remarks = null;
    clearFields.hr_pms_evidence_url = null; clearFields.hr_pms_evidence_urls = null; clearFields.hr_pms_achieved_value = null;
  }
  if (targetIdx <= FULL_STATUS_ORDER.indexOf('audit')) {
    clearFields.auditor_rating = null; clearFields.auditor_score = null; clearFields.auditor_remarks = null;
    clearFields.auditor_evidence_url = null; clearFields.auditor_evidence_urls = null; clearFields.auditor_achieved_value = null;
  }
  if (targetIdx <= FULL_STATUS_ORDER.indexOf('management_review')) {
    clearFields.management_rating = null; clearFields.management_score = null; clearFields.management_remarks = null;
    clearFields.management_evidence_url = null; clearFields.management_evidence_urls = null; clearFields.management_achieved_value = null;
  }
  if (target_status !== 'approved') {
    clearFields.final_rating = null; clearFields.final_score = null;
  }

  return clearFields;
}

/**
 * Hook for admin to move a KPI's workflow status backward to any preceding stage.
 * Supports full reset and multi-month sibling reversion.
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
      full_reset = false,
      revert_siblings = false,
    }: AdminStepBackParams) => {
      if (!user?.id) throw new Error('User not authenticated');

      const effectiveTarget = full_reset ? 'kra_set' as const : target_status;

      // If the regression lands on kra_set, stamp the admin's reason into
      // the transaction-local var so the notify_on_kpi_status_change trigger
      // can include it in metadata.send_back_reason (manager_rejected email).
      if (effectiveTarget === 'kra_set' && reason) {
        await supabase.rpc('record_send_back_reason' as any, { p_reason: reason });
      }

      // 1. Update KPI status
      const { data, error } = await supabase
        .from('kpis')
        .update({ status: effectiveTarget, updated_at: new Date().toISOString() })
        .eq('id', kpi_id)
        .select()
        .single();

      if (error) throw error;

      // 2. Clear review submission data
      const clearFields = full_reset ? buildFullResetFields() : buildCascadeClearFields(effectiveTarget);

      const { error: subError } = await supabase
        .from('review_submissions')
        .update(clearFields)
        .eq('kpi_id', kpi_id);

      if (subError) {
        console.error('Failed to clear downstream review data:', subError);
      }

      // 2b. Create a kpi_queries entry for visibility in Review Journey
      const { error: queryError } = await supabase.from('kpi_queries').insert({
        kpi_id,
        raised_by: user.id,
        raised_to: employee_id,
        reason: `[ADMIN ${full_reset ? 'FULL RESET' : 'SENT BACK'}] ${reason}`,
        entity_type: 'kpi' as const,
        status: 'resolved' as const,
        resolved_at: new Date().toISOString(),
        query_type: 'send_back',
      });

      if (queryError) {
        console.error('Failed to create kpi_queries entry:', queryError);
      }

      // 3. Insert audit log
      const auditAction = full_reset ? 'ADMIN_FULL_RESET' : 'ADMIN_STATUS_STEP_BACK';
      const { error: auditError } = await supabase.from('kpi_audit_logs').insert({
        kpi_id,
        action: auditAction,
        performed_by: user.id,
        on_behalf_of: employee_id,
        on_behalf_role: 'admin',
        old_value: { status: current_status } as any,
        new_value: { status: effectiveTarget } as any,
        metadata: {
          reason,
          source: 'admin_status_step_back',
          from_status: current_status,
          to_status: effectiveTarget,
          full_reset,
        },
      });

      if (auditError) console.error('Failed to create audit log:', auditError);

      // 4. Notify employee
      const { error: notifyError } = await supabase.from('notifications').insert({
        user_id: employee_id,
        type: 'admin_status_step_back',
        title: full_reset ? 'KPI Fully Reset by Admin' : 'KPI Status Moved Back by Admin',
        message: `Admin ${full_reset ? 'fully reset' : 'moved'} your KPI "${kpi_name}" from ${current_status} back to ${effectiveTarget}. Reason: ${reason}`,
        kpi_id,
        related_user_id: user.id,
        metadata: { reason, from_status: current_status, to_status: effectiveTarget, full_reset },
      });

      if (notifyError) console.error('Failed to create notification:', notifyError);

      // 5. Revert multi-month siblings if requested (current was approved)
      if (revert_siblings && current_status === 'approved') {
        try {
          // Fetch KPI details for sibling lookup
          const { data: kpiData } = await supabase
            .from('kpis')
            .select('kra_name, kpi_name, review_year, frequency, review_period, frequency_cycle_start')
            .eq('id', kpi_id)
            .single();

          if (kpiData && kpiData.frequency) {
            // POLICY: cascade is bounded by the source KPI's own multi-month
            // cycle (e.g. Bi-Monthly Mar → only Apr; Quarterly Mar → only the
            // matching Jan-Mar OR Mar-May cycle members). Never year-wide.
            // See: src/lib/multimonthAssignment.ts#getCycleMembers
            const { getCycleMembers } = await import('@/lib/multimonthAssignment');
            const cycleMembers = getCycleMembers({
              frequency: kpiData.frequency,
              reviewPeriod: kpiData.review_period,
              reviewYear: kpiData.review_year,
              frequencyCycleStart: (kpiData as any).frequency_cycle_start ?? null,
            });
            const otherMembers = cycleMembers.filter(
              (m) => !(m.period === kpiData.review_period && m.year === kpiData.review_year),
            );

            if (otherMembers.length > 0) {
              const periodList = Array.from(new Set(otherMembers.map((m) => m.period)));
              const yearList = Array.from(new Set(otherMembers.map((m) => m.year)));

              const { data: candidates } = await supabase
                .from('kpis')
                .select('id, review_period, review_year, status')
                .eq('employee_id', employee_id)
                .eq('kra_name', kpiData.kra_name)
                .eq('kpi_name', kpiData.kpi_name)
                .eq('frequency', kpiData.frequency)
                .in('review_period', periodList)
                .in('review_year', yearList)
                .neq('id', kpi_id);

              // Final guard: only keep candidates whose (period, year) tuple
              // is in the cycle — protects against the .in() cross-product
              // when a cycle wraps the year.
              const siblings = (candidates ?? []).filter((c) =>
                otherMembers.some(
                  (m) => m.period === c.review_period && m.year === c.review_year,
                ),
              );

              for (const sibling of siblings) {
                // Update sibling KPI status
                await supabase
                  .from('kpis')
                  .update({ status: effectiveTarget, updated_at: new Date().toISOString() })
                  .eq('id', sibling.id);

                // Clear sibling submission data
                await supabase
                  .from('review_submissions')
                  .update(full_reset ? buildFullResetFields() : buildCascadeClearFields(effectiveTarget))
                  .eq('kpi_id', sibling.id);

                // Audit log for sibling
                await supabase.from('kpi_audit_logs').insert({
                  kpi_id: sibling.id,
                  action: 'SIBLING_STEP_BACK',
                  performed_by: user.id,
                  on_behalf_of: employee_id,
                  on_behalf_role: 'admin',
                  old_value: { status: sibling.status } as any,
                  new_value: { status: effectiveTarget } as any,
                  metadata: {
                    reason,
                    source_kpi_id: kpi_id,
                    source_period: kpiData.review_period,
                    source_year: kpiData.review_year,
                    cycle_members: cycleMembers,
                    full_reset,
                  } as any,
                });
              }
            }
          }
        } catch (siblingErr) {
          console.error('Failed to revert siblings:', siblingErr);
        }
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['all-kpis'] });
      queryClient.invalidateQueries({ queryKey: ['kpis'] });
      queryClient.invalidateQueries({ queryKey: ['kpis-by-period'] });
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

// ========== Fast Track to Approved ==========

export interface AdminFastTrackParams {
  kpi_id: string;
  employee_id: string;
  rating: RatingLevel;
  score: number;
  achieved_value: number | null;
  reason: string;
  kpi_name: string;
  remaining_stages: AdminRoleLevel[]; // e.g. ['manager', 'skip_level', 'hr_pms']
}

/**
 * Hook for admin to fast-track a KPI directly to 'approved' by filling all
 * remaining review stage fields in a single operation.
 */
export function useAdminFastTrackApprove() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({
      kpi_id,
      employee_id,
      rating,
      score,
      achieved_value,
      reason,
      kpi_name,
      remaining_stages,
    }: AdminFastTrackParams) => {
      if (!user?.id) throw new Error('User not authenticated');

      // 1. Build a single update covering ALL remaining stage fields at once
      const updateFields: Record<string, unknown> = {
        final_rating: rating,
        final_score: score,
        kpi_status: 'submitted' as const,
        updated_at: new Date().toISOString(),
        auto_advance_reason: `Fast-tracked to Approved by Admin. Reason: ${reason}`,
      };

      for (const stage of remaining_stages) {
        updateFields[`${stage}_rating`] = rating;
        updateFields[`${stage}_score`] = score;
        updateFields[`${stage}_achieved_value`] = achieved_value;
      }

      // 2. Get existing submission for audit trail
      const { data: existingSubmission } = await supabase
        .from('review_submissions')
        .select('*')
        .eq('kpi_id', kpi_id)
        .maybeSingle();

      // 3. Upsert review_submissions in one call
      const { data: newSubmission, error: subError } = await supabase
        .from('review_submissions')
        .upsert(
          { kpi_id, ...updateFields },
          { onConflict: 'kpi_id' }
        )
        .select()
        .single();

      if (subError) throw subError;

      // 4. Update KPI status directly to 'approved'
      const { error: kpiError } = await supabase
        .from('kpis')
        .update({ status: 'approved' as any, updated_at: new Date().toISOString() })
        .eq('id', kpi_id);

      if (kpiError) throw kpiError;

      // 5. Create audit log
      const { error: auditError } = await supabase.from('kpi_audit_logs').insert({
        kpi_id,
        action: 'ADMIN_FAST_TRACK_APPROVED',
        performed_by: user.id,
        on_behalf_of: employee_id,
        on_behalf_role: 'admin',
        old_value: existingSubmission || null,
        new_value: newSubmission,
        metadata: {
          reason,
          source: 'admin_fast_track_approve',
          stages_filled: remaining_stages,
          fields_updated: Object.keys(updateFields),
        },
      });

      if (auditError) console.error('Failed to create audit log:', auditError);

      // 6. Notify employee
      const { error: notifyError } = await supabase.from('notifications').insert({
        user_id: employee_id,
        type: 'admin_fast_track_approved',
        title: 'KPI Fast-Tracked to Approved by Admin',
        message: `Admin fast-tracked your KPI "${kpi_name}" to Approved status, filling ${remaining_stages.length} remaining stage(s). Reason: ${reason}`,
        kpi_id,
        related_user_id: user.id,
        metadata: { reason, stages_filled: remaining_stages },
      });

      if (notifyError) console.error('Failed to create notification:', notifyError);

      return newSubmission;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['review-submission-admin'] });
      queryClient.invalidateQueries({ queryKey: ['review-submissions'] });
      queryClient.invalidateQueries({ queryKey: ['kpis'] });
      queryClient.invalidateQueries({ queryKey: ['all-kpis'] });
      queryClient.invalidateQueries({ queryKey: ['kpis-by-period'] });
      toast({
        title: 'KPI Fast-Tracked to Approved',
        description: 'All remaining stages filled. Audit log created and employee notified.',
      });
    },
    onError: (error) => {
      console.error('Admin fast-track approve failed:', error);
      toast({
        title: 'Failed to fast-track KPI',
        description: (error as Error).message,
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

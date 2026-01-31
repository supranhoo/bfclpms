import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';

export type ReviewLevel = 'manager' | 'auditor' | 'management' | 'admin';

export interface ReviewerOverrideEntry {
  sub_period_value: string;  // Date string (YYYY-MM-DD)
  achieved_value: number;    // New value (0 or 5 for binary)
  original_value: number | null;  // Previous value for audit
}

export interface ReviewerOverrideParams {
  kpi_id: string;
  employee_id: string;
  review_level: ReviewLevel;
  overrides: ReviewerOverrideEntry[];
  reason: string;
  review_month: string;
  review_year: number;
  original_score: number | null;
  new_score: number;
}

// Column mapping for each review level
const LEVEL_COLUMN_MAP: Record<ReviewLevel, string> = {
  manager: 'manager_achieved_value',
  auditor: 'auditor_achieved_value',
  management: 'management_achieved_value',
  admin: 'admin_achieved_value',
};

// Audit action mapping
const LEVEL_AUDIT_ACTION_MAP: Record<ReviewLevel, string> = {
  manager: 'MANAGER_DAILY_OVERRIDE',
  auditor: 'AUDITOR_DAILY_OVERRIDE',
  management: 'MANAGEMENT_DAILY_OVERRIDE',
  admin: 'ADMIN_DAILY_OVERRIDE',
};

export function useReviewerSubPeriodOverride() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();

  const saveOverrides = useMutation({
    mutationFn: async (params: ReviewerOverrideParams) => {
      if (!user?.id) throw new Error('Not authenticated');

      const { kpi_id, employee_id, review_level, overrides, reason, review_month, review_year, original_score, new_score } = params;
      const columnName = LEVEL_COLUMN_MAP[review_level];

      // Process each override entry
      for (const override of overrides) {
        // Check if a submission exists for this date
        const { data: existing } = await supabase
          .from('sub_period_submissions')
          .select('id, achieved_value, manager_achieved_value, auditor_achieved_value, management_achieved_value')
          .eq('kpi_id', kpi_id)
          .eq('sub_period_value', override.sub_period_value)
          .eq('review_month', review_month)
          .eq('review_year', review_year)
          .maybeSingle();

        if (existing) {
          // Update existing submission - save to level-specific column
          const { error: updateError } = await supabase
            .from('sub_period_submissions')
            .update({
              [columnName]: override.achieved_value,
              update_reason: `${review_level.charAt(0).toUpperCase() + review_level.slice(1)} override: ${reason}`,
              updated_at: new Date().toISOString(),
            })
            .eq('id', existing.id);

          if (updateError) throw updateError;
        } else {
          // Create new submission for missing day (reviewer filling in)
          const { error: insertError } = await supabase
            .from('sub_period_submissions')
            .insert({
              kpi_id,
              sub_period_type: 'daily',
              sub_period_value: override.sub_period_value,
              review_month,
              review_year,
              achieved_value: null, // Employee didn't submit
              [columnName]: override.achieved_value, // Reviewer's value
              submitted_by: user.id,
              submitted_at: new Date().toISOString(),
              update_reason: `${review_level.charAt(0).toUpperCase() + review_level.slice(1)} override (filled missing): ${reason}`,
            });

          if (insertError) throw insertError;
        }
      }

      // After processing overrides, update remaining entries to copy previous level values
      const previousColumnMap: Record<ReviewLevel, string> = {
        manager: 'achieved_value',
        auditor: 'manager_achieved_value',
        management: 'auditor_achieved_value',
        admin: 'management_achieved_value',
      };
      const previousColumn = previousColumnMap[review_level];

      const { data: allSubmissions, error: fetchAllError } = await supabase
        .from('sub_period_submissions')
        .select('id, achieved_value, manager_achieved_value, auditor_achieved_value, management_achieved_value, sub_period_value')
        .eq('kpi_id', kpi_id)
        .eq('review_month', review_month)
        .eq('review_year', review_year);

      if (fetchAllError) throw fetchAllError;

      // Get the dates that were overridden
      const overriddenDates = new Set(overrides.map(o => o.sub_period_value));

      // Update non-overridden entries to copy previous level value to current level column
      for (const sub of allSubmissions || []) {
        if (!overriddenDates.has(sub.sub_period_value)) {
          const previousValue = sub[previousColumn as keyof typeof sub] as number | null;
          if (previousValue !== null) {
            const { error: copyError } = await supabase
              .from('sub_period_submissions')
              .update({
                [columnName]: previousValue,
                updated_at: new Date().toISOString(),
              })
              .eq('id', sub.id);

            if (copyError) throw copyError;
          }
        }
      }

      // Create audit log entry for the override action
      const { error: auditError } = await supabase
        .from('kpi_audit_logs')
        .insert({
          kpi_id,
          action: LEVEL_AUDIT_ACTION_MAP[review_level],
          performed_by: user.id,
          on_behalf_of: employee_id,
          on_behalf_role: 'employee',
          metadata: {
            reason,
            original_score,
            new_score,
            review_month,
            review_year,
            review_level,
            overrides: overrides.map(o => ({
              date: o.sub_period_value,
              from: o.original_value,
              to: o.achieved_value,
            })),
          },
        });

      if (auditError) {
        console.error('Failed to create audit log:', auditError);
        // Don't throw - audit log failure shouldn't block the override
      }

      return { success: true };
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['sub-period-submissions'] });
      queryClient.invalidateQueries({ queryKey: ['sub-period-submissions-batch'] });
      queryClient.invalidateQueries({ queryKey: ['kpi-audit-logs'] });
      const levelLabel = variables.review_level.charAt(0).toUpperCase() + variables.review_level.slice(1);
      toast({ title: 'Daily entries updated', description: `${levelLabel} overrides have been saved.` });
    },
    onError: (error: Error) => {
      toast({ 
        title: 'Failed to save overrides', 
        description: error.message, 
        variant: 'destructive' 
      });
    },
  });

  /**
   * Copy values from previous level when a reviewer accepts without changes
   */
  const acceptPreviousLevel = useMutation({
    mutationFn: async ({
      kpi_id,
      review_level,
      review_month,
      review_year,
    }: {
      kpi_id: string;
      review_level: ReviewLevel;
      review_month: string;
      review_year: number;
    }) => {
      if (!user?.id) throw new Error('Not authenticated');

      const columnName = LEVEL_COLUMN_MAP[review_level];
      
      // Determine which previous column to copy from
      const previousColumnMap: Record<ReviewLevel, string> = {
        manager: 'achieved_value',
        auditor: 'manager_achieved_value',
        management: 'auditor_achieved_value',
        admin: 'management_achieved_value',
      };
      const previousColumn = previousColumnMap[review_level];

      // Get all submissions for this KPI/period
      const { data: submissions, error: fetchError } = await supabase
        .from('sub_period_submissions')
        .select('id, achieved_value, manager_achieved_value, auditor_achieved_value, management_achieved_value')
        .eq('kpi_id', kpi_id)
        .eq('review_month', review_month)
        .eq('review_year', review_year);

      if (fetchError) throw fetchError;
      if (!submissions || submissions.length === 0) return { updated: 0 };

      // Update each submission to copy from previous level
      let updated = 0;
      for (const sub of submissions) {
        const previousValue = sub[previousColumn as keyof typeof sub] as number | null;
        
        // Only update if there's a value to copy
        if (previousValue !== null) {
          const { error } = await supabase
            .from('sub_period_submissions')
            .update({
              [columnName]: previousValue,
              updated_at: new Date().toISOString(),
            })
            .eq('id', sub.id);

          if (error) throw error;
          updated++;
        }
      }

      return { updated };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sub-period-submissions'] });
      queryClient.invalidateQueries({ queryKey: ['sub-period-submissions-batch'] });
    },
    onError: (error: Error) => {
      console.error('Failed to accept previous level values:', error);
    },
  });

  return {
    saveOverrides,
    acceptPreviousLevel,
    isLoading: saveOverrides.isPending || acceptPreviousLevel.isPending,
  };
}

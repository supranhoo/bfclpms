import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';

export interface ManagerOverrideEntry {
  sub_period_value: string;  // Date string (YYYY-MM-DD)
  achieved_value: number;    // New value (0 or 5 for binary)
  original_value: number | null;  // Previous value for audit
}

export interface ManagerOverrideParams {
  kpi_id: string;
  employee_id: string;
  overrides: ManagerOverrideEntry[];
  reason: string;
  review_month: string;
  review_year: number;
  original_score: number | null;
  new_score: number;
}

export function useManagerSubPeriodOverride() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();

  const saveOverrides = useMutation({
    mutationFn: async (params: ManagerOverrideParams) => {
      if (!user?.id) throw new Error('Not authenticated');

      const { kpi_id, employee_id, overrides, reason, review_month, review_year, original_score, new_score } = params;

      // Process each override entry
      for (const override of overrides) {
        // Check if a submission exists for this date
        const { data: existing } = await supabase
          .from('sub_period_submissions')
          .select('id, achieved_value')
          .eq('kpi_id', kpi_id)
          .eq('sub_period_value', override.sub_period_value)
          .eq('review_month', review_month)
          .eq('review_year', review_year)
          .maybeSingle();

        if (existing) {
          // Update existing submission - save to manager_achieved_value column
          const { error: updateError } = await supabase
            .from('sub_period_submissions')
            .update({
              manager_achieved_value: override.achieved_value,
              update_reason: `Manager override: ${reason}`,
              updated_at: new Date().toISOString(),
            })
            .eq('id', existing.id);

          if (updateError) throw updateError;
        } else {
          // Create new submission for missing day (manager filling in)
          const { error: insertError } = await supabase
            .from('sub_period_submissions')
            .insert({
              kpi_id,
              sub_period_type: 'daily',
              sub_period_value: override.sub_period_value,
              review_month,
              review_year,
              achieved_value: null, // Employee didn't submit
              manager_achieved_value: override.achieved_value, // Manager's value
              submitted_by: user.id,
              submitted_at: new Date().toISOString(),
              update_reason: `Manager override (filled missing): ${reason}`,
            });

          if (insertError) throw insertError;
        }
      }

      // Create audit log entry for the override action
      const { error: auditError } = await supabase
        .from('kpi_audit_logs')
        .insert({
          kpi_id,
          action: 'MANAGER_DAILY_OVERRIDE',
          performed_by: user.id,
          on_behalf_of: employee_id,
          on_behalf_role: 'employee',
          metadata: {
            reason,
            original_score,
            new_score,
            review_month,
            review_year,
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sub-period-submissions'] });
      queryClient.invalidateQueries({ queryKey: ['kpi-audit-logs'] });
      toast({ title: 'Daily entries updated', description: 'Manager overrides have been saved.' });
    },
    onError: (error: Error) => {
      toast({ 
        title: 'Failed to save overrides', 
        description: error.message, 
        variant: 'destructive' 
      });
    },
  });

  return {
    saveOverrides,
    isLoading: saveOverrides.isPending,
  };
}

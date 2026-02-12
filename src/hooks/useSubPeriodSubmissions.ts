import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';

export interface SubPeriodSubmission {
  id: string;
  kpi_id: string;
  sub_period_type: 'daily' | 'weekly';
  sub_period_value: string;
  achieved_value: number | null;
  remarks: string | null;
  evidence_url: string | null;
  submitted_at: string;
  submitted_by: string | null;
  review_month: string;
  review_year: number;
  created_at: string;
  updated_at: string;
  update_reason: string | null;
  is_resubmitted: boolean;
  // Per-level approved values
  manager_achieved_value: number | null;
  auditor_achieved_value: number | null;
  management_achieved_value: number | null;
  admin_achieved_value: number | null;
}

/**
 * Fetch sub-period submissions for a KPI in a specific month/year
 */
export function useSubPeriodSubmissions(kpiId: string | undefined, month: string, year: number) {
  return useQuery({
    queryKey: ['sub-period-submissions', kpiId, month, year],
    queryFn: async () => {
      if (!kpiId) return [];
      
      const { data, error } = await supabase
        .from('sub_period_submissions')
        .select('*')
        .eq('kpi_id', kpiId)
        .eq('review_month', month)
        .eq('review_year', year)
        .order('sub_period_value', { ascending: true });
      
      if (error) throw error;
      return data as SubPeriodSubmission[];
    },
    enabled: !!kpiId && !!month && !!year,
  });
}

/**
 * Fetch all sub-period submissions for multiple KPIs
 */
export function useSubPeriodSubmissionsByKpis(kpiIds: string[], month: string, year: number) {
  return useQuery({
    queryKey: ['sub-period-submissions-batch', kpiIds, month, year],
    queryFn: async () => {
      if (kpiIds.length === 0) return [];
      
      // Batch in groups of 100 to avoid query limits
      const batchSize = 100;
      const allSubmissions: SubPeriodSubmission[] = [];
      
      for (let i = 0; i < kpiIds.length; i += batchSize) {
        const batch = kpiIds.slice(i, i + batchSize);
        const { data, error } = await supabase
          .from('sub_period_submissions')
          .select('*')
          .in('kpi_id', batch)
          .eq('review_month', month)
          .eq('review_year', year);
        
        if (error) throw error;
        if (data) allSubmissions.push(...(data as SubPeriodSubmission[]));
      }
      
      return allSubmissions;
    },
    enabled: kpiIds.length > 0 && !!month && !!year,
  });
}

/**
 * Submit or update a sub-period entry
 */
export function useSubmitSubPeriod() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({
      kpi_id,
      sub_period_type,
      sub_period_value,
      achieved_value,
      remarks,
      evidence_url,
      review_month,
      review_year,
      update_reason,
      is_resubmission,
    }: {
      kpi_id: string;
      sub_period_type: 'daily' | 'weekly';
      sub_period_value: string;
      achieved_value: number | null;
      remarks?: string | null;
      evidence_url?: string | null;
      review_month: string;
      review_year: number;
      update_reason?: string | null;
      is_resubmission?: boolean;
    }) => {
      const { data, error } = await supabase
        .from('sub_period_submissions')
        .upsert(
          {
            kpi_id,
            sub_period_type,
            sub_period_value,
            achieved_value,
            remarks: remarks || null,
            evidence_url: evidence_url || null,
            review_month,
            review_year,
            submitted_by: user?.id,
            submitted_at: new Date().toISOString(),
            update_reason: update_reason || null,
            is_resubmitted: is_resubmission || false,
          },
          {
            onConflict: 'kpi_id,sub_period_type,sub_period_value,review_month,review_year',
          }
        )
        .select()
        .single();

      if (error) throw error;
      return data as SubPeriodSubmission;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['sub-period-submissions'] });
      queryClient.invalidateQueries({ queryKey: ['sub-period-submissions-batch'] });
      toast({ title: 'Submission saved successfully' });
    },
    onError: (error: Error) => {
      toast({ 
        title: 'Failed to save submission', 
        description: error.message, 
        variant: 'destructive' 
      });
    },
  });
}

/**
 * Delete a sub-period submission
 */
export function useDeleteSubPeriodSubmission() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('sub_period_submissions')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sub-period-submissions'] });
      queryClient.invalidateQueries({ queryKey: ['sub-period-submissions-batch'] });
      toast({ title: 'Submission deleted' });
    },
    onError: (error: Error) => {
      toast({ 
        title: 'Failed to delete submission', 
        description: error.message, 
        variant: 'destructive' 
      });
    },
  });
}

/**
 * Calculate aggregated score from sub-period submissions
 */
export function calculateAggregatedScore(submissions: SubPeriodSubmission[]): number | null {
  const validSubmissions = submissions.filter(s => s.achieved_value !== null);
  
  if (validSubmissions.length === 0) return null;
  
  const sum = validSubmissions.reduce((acc, s) => acc + (s.achieved_value ?? 0), 0);
  return sum / validSubmissions.length;
}

/**
 * Hook to get aggregated score for a KPI based on sub-period submissions
 */
export function useAggregatedScore(kpiId: string | undefined, month: string, year: number) {
  const { data: submissions } = useSubPeriodSubmissions(kpiId, month, year);
  
  return {
    score: submissions ? calculateAggregatedScore(submissions) : null,
    submissionCount: submissions?.length || 0,
    submissions: submissions || [],
  };
}

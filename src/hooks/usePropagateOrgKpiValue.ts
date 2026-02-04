import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { calculateRating, RatingThresholds } from '@/lib/ratingCalculation';
import { scoreToRating } from '@/components/review/ScoreSelector';

interface PropagateParams {
  categoryId: string;
  kraName: string;
  kpiName: string;
  reviewPeriod: string;
  reviewYear: number;
  achievedValue: number | null;
  scope: 'organization' | 'department' | 'employee';
  departmentId?: string | null;
  employeeId?: string | null;
}

/**
 * Propagate org-level KPI values to review_submissions
 * When an admin saves an org value, this updates all matching employee KPIs
 */
export function usePropagateOrgKpiValue() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (params: PropagateParams) => {
      const {
        categoryId,
        kraName,
        kpiName,
        reviewPeriod,
        reviewYear,
        achievedValue,
        scope,
        departmentId,
        employeeId,
      } = params;

      // 1. Find all matching KPIs
      let kpisQuery = supabase
        .from('kpis')
        .select(`
          id,
          employee_id,
          target_value,
          weightage,
          r5, r4, r3, r2, r1, r0,
          criteria,
          uom_type,
          qualitative_options,
          is_org_level,
          org_level_scope,
          profiles!kpis_employee_id_fkey(department_id)
        `)
        .eq('category_id', categoryId)
        .eq('kra_name', kraName)
        .eq('kpi_name', kpiName)
        .eq('review_period', reviewPeriod)
        .eq('review_year', reviewYear)
        .eq('is_org_level', true);

      const { data: kpis, error: kpisError } = await kpisQuery;
      if (kpisError) throw kpisError;

      if (!kpis || kpis.length === 0) {
        return { propagatedCount: 0 };
      }

      // 2. Filter KPIs based on scope
      let targetKpis = kpis;
      if (scope === 'department' && departmentId) {
        targetKpis = kpis.filter(k => (k.profiles as any)?.department_id === departmentId);
      } else if (scope === 'employee' && employeeId) {
        targetKpis = kpis.filter(k => k.employee_id === employeeId);
      }

      if (targetKpis.length === 0) {
        return { propagatedCount: 0 };
      }

      // 3. Calculate scores and upsert review_submissions
      const upsertPromises = targetKpis.map(async (kpi) => {
        const thresholds: RatingThresholds = {
          r5: kpi.r5,
          r4: kpi.r4,
          r3: kpi.r3,
          r2: kpi.r2,
          r1: kpi.r1,
          r0: kpi.r0,
        };

        const ratingResult = calculateRating(
          achievedValue,
          kpi.target_value,
          thresholds,
          kpi.criteria || 'Higher is Better',
          kpi.weightage || 0,
          (kpi.uom_type as any) || 'numeric',
          kpi.qualitative_options as any
        );

        const ratingLevel = scoreToRating(ratingResult.rating);

        // Check if submission exists
        const { data: existingSubmission } = await supabase
          .from('review_submissions')
          .select('id')
          .eq('kpi_id', kpi.id)
          .maybeSingle();

        if (existingSubmission) {
          // Update existing submission
          const { error } = await supabase
            .from('review_submissions')
            .update({
              achieved_value: achievedValue,
              self_score: ratingResult.rating,
              self_rating: ratingLevel,
              updated_at: new Date().toISOString(),
            })
            .eq('id', existingSubmission.id);

          if (error) throw error;
        } else {
          // Insert new submission
          const { error } = await supabase
            .from('review_submissions')
            .insert({
              kpi_id: kpi.id,
              achieved_value: achievedValue,
              self_score: ratingResult.rating,
              self_rating: ratingLevel,
            });

          if (error) throw error;
        }

        // Update KPI status to self_review if still at kra_set
        const { error: statusError } = await supabase
          .from('kpis')
          .update({ status: 'self_review' })
          .eq('id', kpi.id)
          .eq('status', 'kra_set');

        if (statusError) {
          console.warn('Failed to update KPI status:', statusError);
        }

        return kpi.id;
      });

      await Promise.all(upsertPromises);

      return { propagatedCount: targetKpis.length };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['kpis'] });
      queryClient.invalidateQueries({ queryKey: ['review-submissions'] });
      if (result.propagatedCount > 0) {
        toast({ 
          title: `Propagated to ${result.propagatedCount} employee KPI(s)`,
          description: 'Review submissions updated with org-level values'
        });
      }
    },
    onError: (error: Error) => {
      toast({ 
        title: 'Failed to propagate values', 
        description: error.message, 
        variant: 'destructive' 
      });
    },
  });
}

/**
 * Bulk propagate multiple org values at once
 */
export function useBulkPropagateOrgKpiValues() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (values: PropagateParams[]) => {
      let totalPropagated = 0;

      for (const params of values) {
        const {
          categoryId,
          kraName,
          kpiName,
          reviewPeriod,
          reviewYear,
          achievedValue,
          scope,
          departmentId,
          employeeId,
        } = params;

        // Skip if no achieved value
        if (achievedValue === null) continue;

        // Find matching KPIs
        let kpisQuery = supabase
          .from('kpis')
          .select(`
            id,
            employee_id,
            target_value,
            weightage,
            r5, r4, r3, r2, r1, r0,
            criteria,
            uom_type,
            qualitative_options,
            profiles!kpis_employee_id_fkey(department_id)
          `)
          .eq('category_id', categoryId)
          .eq('kra_name', kraName)
          .eq('kpi_name', kpiName)
          .eq('review_period', reviewPeriod)
          .eq('review_year', reviewYear)
          .eq('is_org_level', true);

        const { data: kpis } = await kpisQuery;
        if (!kpis || kpis.length === 0) continue;

        // Filter by scope
        let targetKpis = kpis;
        if (scope === 'department' && departmentId) {
          targetKpis = kpis.filter(k => (k.profiles as any)?.department_id === departmentId);
        } else if (scope === 'employee' && employeeId) {
          targetKpis = kpis.filter(k => k.employee_id === employeeId);
        }

        // Process each KPI
        for (const kpi of targetKpis) {
          const thresholds: RatingThresholds = {
            r5: kpi.r5,
            r4: kpi.r4,
            r3: kpi.r3,
            r2: kpi.r2,
            r1: kpi.r1,
            r0: kpi.r0,
          };

          const ratingResult = calculateRating(
            achievedValue,
            kpi.target_value,
            thresholds,
            kpi.criteria || 'Higher is Better',
            kpi.weightage || 0,
            (kpi.uom_type as any) || 'numeric',
            kpi.qualitative_options as any
          );

          const ratingLevel = scoreToRating(ratingResult.rating);

          // Upsert submission
          const { data: existing } = await supabase
            .from('review_submissions')
            .select('id')
            .eq('kpi_id', kpi.id)
            .maybeSingle();

          if (existing) {
            await supabase
              .from('review_submissions')
              .update({
                achieved_value: achievedValue,
                self_score: ratingResult.rating,
                self_rating: ratingLevel,
              })
              .eq('id', existing.id);
          } else {
            await supabase
              .from('review_submissions')
              .insert({
                kpi_id: kpi.id,
                achieved_value: achievedValue,
                self_score: ratingResult.rating,
                self_rating: ratingLevel,
              });
          }

          // Update KPI status
          await supabase
            .from('kpis')
            .update({ status: 'self_review' })
            .eq('id', kpi.id)
            .eq('status', 'kra_set');

          totalPropagated++;
        }
      }

      return { propagatedCount: totalPropagated };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['kpis'] });
      queryClient.invalidateQueries({ queryKey: ['review-submissions'] });
      if (result.propagatedCount > 0) {
        toast({ 
          title: `Propagated to ${result.propagatedCount} employee KPI(s)`,
        });
      }
    },
    onError: (error: Error) => {
      toast({ 
        title: 'Failed to propagate values', 
        description: error.message, 
        variant: 'destructive' 
      });
    },
  });
}

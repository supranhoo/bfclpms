import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { calculateRating, RatingThresholds } from '@/lib/ratingCalculation';
import { scoreToRating } from '@/components/review/ScoreSelector';

export interface PropagationDetail {
  employeeName: string;
  employeeCode: string | null;
  departmentName: string | null;
  oldScore: number | null;
  newScore: number | null;
  change: number | null;
}

export interface PropagationResultWithDetails {
  propagatedCount: number;
  details: PropagationDetail[];
}

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

  return useMutation<PropagationResultWithDetails, Error, PropagateParams>({
    mutationFn: async (params: PropagateParams): Promise<PropagationResultWithDetails> => {
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
          uom,
          uom_type,
          qualitative_options,
          threshold_mode,
          is_org_level,
          org_level_scope,
          profiles!kpis_employee_id_fkey(id, full_name, employee_code, department_id, departments(name))
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
        return { propagatedCount: 0, details: [] };
      }

      // 2. Filter KPIs based on scope
      let targetKpis = kpis;
      if (scope === 'department' && departmentId) {
        targetKpis = kpis.filter(k => (k.profiles as any)?.department_id === departmentId);
      } else if (scope === 'employee' && employeeId) {
        targetKpis = kpis.filter(k => k.employee_id === employeeId);
      }

      if (targetKpis.length === 0) {
        return { propagatedCount: 0, details: [] };
      }

      // 3. Calculate scores and upsert review_submissions
      const details: PropagationDetail[] = [];
      const upsertPromises = targetKpis.map(async (kpi) => {
        const profile = kpi.profiles as any;
        const thresholds: RatingThresholds = {
          r5: kpi.r5, r4: kpi.r4, r3: kpi.r3,
          r2: kpi.r2, r1: kpi.r1, r0: kpi.r0,
        };

        const ratingResult = calculateRating(
          achievedValue,
          kpi.target_value,
          thresholds,
          kpi.criteria || 'Higher is Better',
          kpi.weightage || 0,
          (kpi.uom_type as any) || 'numeric',
          kpi.qualitative_options as any,
          kpi.uom,
          (kpi as any).threshold_mode || 'absolute'
        );

        const ratingLevel = scoreToRating(ratingResult.rating);

        // Get old score for change tracking
        const { data: existingSubmission } = await supabase
          .from('review_submissions')
          .select('self_score')
          .eq('kpi_id', kpi.id)
          .maybeSingle();

        const oldScore = existingSubmission?.self_score ?? null;

        // Step 1: Try update first (handles existing rows without RLS/upsert issues)
        const { data: updated, error: updateError } = await supabase
          .from('review_submissions')
          .update({
            achieved_value: achievedValue,
            self_score: ratingResult.rating,
            self_rating: ratingLevel,
            updated_at: new Date().toISOString(),
          })
          .eq('kpi_id', kpi.id)
          .select('id')
          .maybeSingle();

        if (updateError) throw updateError;

        // Step 2: If no existing row, insert
        if (!updated) {
          const { error: insertError } = await supabase
            .from('review_submissions')
            .insert({
              kpi_id: kpi.id,
              achieved_value: achievedValue,
              self_score: ratingResult.rating,
              self_rating: ratingLevel,
            });

          // Race condition: row created between update and insert — retry as update
          if (insertError?.code === '23505') {
            const { error: retryError } = await supabase
              .from('review_submissions')
              .update({
                achieved_value: achievedValue,
                self_score: ratingResult.rating,
                self_rating: ratingLevel,
                updated_at: new Date().toISOString(),
              })
              .eq('kpi_id', kpi.id);
            if (retryError) throw retryError;
          } else if (insertError) {
            throw insertError;
          }
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

        details.push({
          employeeName: profile?.full_name || 'Unknown',
          employeeCode: profile?.employee_code || null,
          departmentName: profile?.departments?.name || null,
          oldScore,
          newScore: ratingResult.rating,
          change: oldScore !== null ? ratingResult.rating - oldScore : null,
        });

        return kpi.id;
      });

      await Promise.all(upsertPromises);

      return { propagatedCount: targetKpis.length, details };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['kpis'] });
      queryClient.invalidateQueries({ queryKey: ['review-submissions'] });
      queryClient.invalidateQueries({ queryKey: ['org-kpi-values'] });
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

  return useMutation<PropagationResultWithDetails, Error, PropagateParams[]>({
    mutationFn: async (values: PropagateParams[]): Promise<PropagationResultWithDetails> => {
      let totalPropagated = 0;
      const allDetails: PropagationDetail[] = [];

      for (const params of values) {
        const { categoryId, kraName, kpiName, reviewPeriod, reviewYear, achievedValue, scope, departmentId, employeeId } = params;
        if (achievedValue === null) continue;

        const { data: kpis } = await supabase
          .from('kpis')
          .select(`
            id, employee_id, target_value, weightage,
            r5, r4, r3, r2, r1, r0, criteria, uom, uom_type,
            qualitative_options, threshold_mode,
            profiles!kpis_employee_id_fkey(id, full_name, employee_code, department_id, departments(name))
          `)
          .eq('category_id', categoryId)
          .eq('kra_name', kraName)
          .eq('kpi_name', kpiName)
          .eq('review_period', reviewPeriod)
          .eq('review_year', reviewYear)
          .eq('is_org_level', true);

        if (!kpis || kpis.length === 0) continue;

        let targetKpis = kpis;
        if (scope === 'department' && departmentId) {
          targetKpis = kpis.filter(k => (k.profiles as any)?.department_id === departmentId);
        } else if (scope === 'employee' && employeeId) {
          targetKpis = kpis.filter(k => k.employee_id === employeeId);
        }

        for (const kpi of targetKpis) {
          const profile = kpi.profiles as any;
          const thresholds: RatingThresholds = {
            r5: kpi.r5, r4: kpi.r4, r3: kpi.r3,
            r2: kpi.r2, r1: kpi.r1, r0: kpi.r0,
          };

          const ratingResult = calculateRating(
            achievedValue, kpi.target_value, thresholds,
            kpi.criteria || 'Higher is Better', kpi.weightage || 0,
            (kpi.uom_type as any) || 'numeric', kpi.qualitative_options as any,
            kpi.uom, (kpi as any).threshold_mode || 'absolute'
          );

          const ratingLevel = scoreToRating(ratingResult.rating);

          // Get old score for change tracking
          const { data: existing } = await supabase
            .from('review_submissions')
            .select('self_score')
            .eq('kpi_id', kpi.id)
            .maybeSingle();

          const oldScore = existing?.self_score ?? null;

          // Step 1: Try update first
          const { data: updated, error: updateError } = await supabase
            .from('review_submissions')
            .update({
              achieved_value: achievedValue,
              self_score: ratingResult.rating,
              self_rating: ratingLevel,
              updated_at: new Date().toISOString(),
            })
            .eq('kpi_id', kpi.id)
            .select('id')
            .maybeSingle();

          if (updateError) throw updateError;

          // Step 2: If no existing row, insert
          if (!updated) {
            const { error: insertError } = await supabase
              .from('review_submissions')
              .insert({
                kpi_id: kpi.id,
                achieved_value: achievedValue,
                self_score: ratingResult.rating,
                self_rating: ratingLevel,
              });

            if (insertError?.code === '23505') {
              const { error: retryError } = await supabase
                .from('review_submissions')
                .update({
                  achieved_value: achievedValue,
                  self_score: ratingResult.rating,
                  self_rating: ratingLevel,
                  updated_at: new Date().toISOString(),
                })
                .eq('kpi_id', kpi.id);
              if (retryError) throw retryError;
            } else if (insertError) {
              throw insertError;
            }
          }

          await supabase.from('kpis').update({ status: 'self_review' }).eq('id', kpi.id).eq('status', 'kra_set');

          allDetails.push({
            employeeName: profile?.full_name || 'Unknown',
            employeeCode: profile?.employee_code || null,
            departmentName: profile?.departments?.name || null,
            oldScore,
            newScore: ratingResult.rating,
            change: oldScore !== null ? ratingResult.rating - oldScore : null,
          });

          totalPropagated++;
        }
      }

      return { propagatedCount: totalPropagated, details: allDetails };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['kpis'] });
      queryClient.invalidateQueries({ queryKey: ['review-submissions'] });
      queryClient.invalidateQueries({ queryKey: ['org-kpi-values'] });
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

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
  isNa?: boolean;
  naRemarks?: string;
  remarks?: string;
}

/**
 * Build the KPI ratings array and employee detail map from fetched KPIs.
 * Rating calculation stays in JS; the array is sent to the server-side RPC.
 */
function buildRatingsPayload(
  targetKpis: any[],
  achievedValue: number | null,
  isNa: boolean
) {
  const kpiRatings: Array<{
    kpi_id: string;
    achieved_value: number | null;
    self_score: number | null;
    self_rating: string | null;
  }> = [];

  const profileMap = new Map<string, { fullName: string; employeeCode: string | null; departmentName: string | null }>();

  for (const kpi of targetKpis) {
    const profile = kpi.profiles as any;
    profileMap.set(kpi.id, {
      fullName: profile?.full_name || 'Unknown',
      employeeCode: profile?.employee_code || null,
      departmentName: profile?.departments?.name || null,
    });

    if (isNa) {
      kpiRatings.push({
        kpi_id: kpi.id,
        achieved_value: null,
        self_score: null,
        self_rating: null,
      });
    } else {
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

      kpiRatings.push({
        kpi_id: kpi.id,
        achieved_value: achievedValue,
        self_score: ratingResult.rating,
        self_rating: scoreToRating(ratingResult.rating),
      });
    }
  }

  return { kpiRatings, profileMap };
}

/**
 * Fetch matching org-level KPIs and filter by scope.
 */
async function fetchTargetKpis(params: PropagateParams) {
  const { categoryId, kraName, kpiName, reviewPeriod, reviewYear, scope, departmentId, employeeId } = params;

  const { data: kpis, error } = await supabase
    .from('kpis')
    .select(`
      id, employee_id, target_value, weightage,
      r5, r4, r3, r2, r1, r0, criteria, uom, uom_type,
      qualitative_options, threshold_mode, is_org_level, org_level_scope,
      profiles!kpis_employee_id_fkey(id, full_name, employee_code, department_id, departments(name))
    `)
    .eq('category_id', categoryId)
    .eq('kra_name', kraName)
    .eq('kpi_name', kpiName)
    .eq('review_period', reviewPeriod)
    .eq('review_year', reviewYear)
    .eq('is_org_level', true);

  if (error) throw error;
  if (!kpis || kpis.length === 0) return [];

  if (scope === 'department' && departmentId) {
    return kpis.filter(k => (k.profiles as any)?.department_id === departmentId);
  } else if (scope === 'employee' && employeeId) {
    return kpis.filter(k => k.employee_id === employeeId);
  }
  return kpis;
}

/**
 * Call the server-side RPC and map results back to PropagationResultWithDetails.
 */
async function callPropagationRpc(
  kpiRatings: any[],
  profileMap: Map<string, any>,
  isNa: boolean,
  remarks?: string | null
): Promise<PropagationResultWithDetails> {
  const { data, error } = await supabase.rpc('propagate_org_kpi_value', {
    p_kpi_ratings: kpiRatings,
    p_is_na: isNa,
    p_remarks: remarks || null,
  });

  if (error) throw error;

  const rpcResult = data as any;
  const details: PropagationDetail[] = (rpcResult.details || []).map((d: any) => {
    const info = profileMap.get(d.kpi_id);
    const newScore = d.new_score ?? null;
    const oldScore = d.old_score ?? null;
    return {
      employeeName: info?.fullName || 'Unknown',
      employeeCode: info?.employeeCode || null,
      departmentName: info?.departmentName || null,
      oldScore,
      newScore,
      change: oldScore !== null && newScore !== null ? newScore - oldScore : null,
    };
  });

  return { propagatedCount: rpcResult.propagated_count, details };
}

/**
 * Propagate org-level KPI values to review_submissions via server-side RPC.
 * Reduces dozens of individual DB calls to 2 (one SELECT, one RPC).
 */
export function usePropagateOrgKpiValue() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation<PropagationResultWithDetails, Error, PropagateParams>({
    mutationFn: async (params: PropagateParams): Promise<PropagationResultWithDetails> => {
      const targetKpis = await fetchTargetKpis(params);
      if (targetKpis.length === 0) return { propagatedCount: 0, details: [] };

      const { kpiRatings, profileMap } = buildRatingsPayload(
        targetKpis, params.achievedValue, !!params.isNa
      );

      return callPropagationRpc(kpiRatings, profileMap, !!params.isNa, params.remarks);
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['kpis'] });
      queryClient.invalidateQueries({ queryKey: ['my-kpis'] });
      queryClient.invalidateQueries({ queryKey: ['all-kpis'] });
      queryClient.invalidateQueries({ queryKey: ['kpis-by-period'] });
      queryClient.invalidateQueries({ queryKey: ['review-submissions'] });
      queryClient.invalidateQueries({ queryKey: ['org-kpi-values'] });
      if (result.propagatedCount > 0) {
        toast({
          title: `Propagated to ${result.propagatedCount} employee KPI(s)`,
          description: 'Review submissions updated with org-level values',
        });
      }
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to propagate values',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

/**
 * Bulk propagate multiple org values at once, using the same server-side RPC.
 */
export function useBulkPropagateOrgKpiValues() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation<PropagationResultWithDetails, Error, PropagateParams[]>({
    mutationFn: async (values: PropagateParams[]): Promise<PropagationResultWithDetails> => {
      let totalPropagated = 0;
      const allDetails: PropagationDetail[] = [];

      // Collect all KPI ratings across all params into one RPC call
      const allRatings: any[] = [];
      const globalProfileMap = new Map<string, any>();
      let hasNa = false;

      for (const params of values) {
        if (params.achievedValue === null && !params.isNa) continue;

        const targetKpis = await fetchTargetKpis(params);
        if (targetKpis.length === 0) continue;

        const { kpiRatings, profileMap } = buildRatingsPayload(
          targetKpis, params.achievedValue, !!params.isNa
        );

        allRatings.push(...kpiRatings);
        profileMap.forEach((v, k) => globalProfileMap.set(k, v));
        if (params.isNa) hasNa = true;
      }

      if (allRatings.length === 0) return { propagatedCount: 0, details: [] };

      const result = await callPropagationRpc(allRatings, globalProfileMap, hasNa, null);
      return result;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['kpis'] });
      queryClient.invalidateQueries({ queryKey: ['my-kpis'] });
      queryClient.invalidateQueries({ queryKey: ['all-kpis'] });
      queryClient.invalidateQueries({ queryKey: ['kpis-by-period'] });
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
        variant: 'destructive',
      });
    },
  });
}

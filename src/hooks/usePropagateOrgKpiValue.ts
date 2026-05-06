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
  priorStatus?: string | null;
}

export interface PropagationResultWithDetails {
  propagatedCount: number;
  details: PropagationDetail[];
  skippedCount?: number;
  skipped?: Array<{ kpi_id: string; current_status: string; reason: string }>;
  overwrittenCount?: number;
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
  evidenceUrl?: string | null;
  /**
   * v2.66.8 — When true, this single mutateAsync call will NOT emit its own
   * success/info toast. Use this when looping over many scopes so the caller
   * can emit ONE summary toast instead of N stacked ones.
   */
  silent?: boolean;
  /**
   * Overwrite policy passed to the RPC. Defaults to 'pre_review_only' which lets
   * data owners overwrite employee self-reviewed values that no manager/auditor
   * has yet acted on. Use 'force_pre_terminal' (admin) to overwrite any
   * non-terminal stage. 'safe' keeps the legacy kra_set-only behaviour.
   */
  overwritePolicy?: 'safe' | 'pre_review_only' | 'force_pre_terminal';
}

/**
 * Build the KPI ratings array and employee detail map from fetched KPIs.
 * Rating calculation stays in JS; the array is sent to the server-side RPC.
 */
function buildRatingsPayload(
  targetKpis: any[],
  achievedValue: number | null,
  isNa: boolean,
  evidenceUrl?: string | null
) {
  const kpiRatings: Array<{
    kpi_id: string;
    achieved_value: number | null;
    self_score: number | null;
    self_rating: string | null;
    evidence_url: string | null;
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
        evidence_url: null,
      });
    } else {
      const uomType = (kpi.uom_type as string) || 'numeric';
      const isBinaryOrTiered = uomType === 'binary' || 
        (uomType === 'tiered' && Array.isArray(kpi.qualitative_options) && (kpi.qualitative_options as any[]).length > 0);

      if (isBinaryOrTiered) {
        // For qualitative KPIs, achievedValue IS the rating score
        const directRating = achievedValue ?? 0;
        kpiRatings.push({
          kpi_id: kpi.id,
          achieved_value: achievedValue,
          self_score: directRating,
          self_rating: scoreToRating(directRating),
          evidence_url: evidenceUrl || null,
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
          'numeric',
          null,
          kpi.uom,
          (kpi as any).threshold_mode || 'absolute'
        );

        kpiRatings.push({
          kpi_id: kpi.id,
          achieved_value: achievedValue,
          self_score: ratingResult.rating,
          self_rating: scoreToRating(ratingResult.rating),
          evidence_url: evidenceUrl || null,
        });
      }
    }
  }

  return { kpiRatings, profileMap };
}

/**
 * Fetch matching org-level KPIs and filter by scope.
 * Falls back to category_id + kra_name matching if exact kpi_name match returns 0 results.
 */
/**
 * Escape special PostgREST ilike characters.
 */
function escapeIlike(val: string): string {
  return val.replace(/[%_]/g, '\\$&');
}

async function fetchTargetKpis(params: PropagateParams) {
  const { categoryId, kraName, kpiName, reviewPeriod, reviewYear, scope, departmentId, employeeId } = params;

  const baseSelect = `
    id, employee_id, target_value, weightage,
    r5, r4, r3, r2, r1, r0, criteria, uom, uom_type,
    qualitative_options, threshold_mode, is_org_level, org_level_scope,
    profiles!kpis_employee_id_fkey(id, full_name, employee_code, department_id, departments(name))
  `;

  const escapedKra = escapeIlike(kraName);
  const escapedKpi = escapeIlike(kpiName);

  // Try case-insensitive exact match first (RC1 fix)
  const { data: kpis, error } = await supabase
    .from('kpis')
    .select(baseSelect)
    .eq('category_id', categoryId)
    .ilike('kra_name', escapedKra)
    .ilike('kpi_name', escapedKpi)
    .eq('review_period', reviewPeriod)
    .eq('review_year', reviewYear)
    .eq('is_org_level', true);

  if (error) throw error;

  let targetKpis = kpis || [];

  // Fallback 1: category + case-insensitive kra matching (if exact kpi_name returns 0)
  if (targetKpis.length === 0) {
    const { data: fallbackKpis, error: fallbackError } = await supabase
      .from('kpis')
      .select(baseSelect)
      .eq('category_id', categoryId)
      .ilike('kra_name', escapedKra)
      .eq('review_period', reviewPeriod)
      .eq('review_year', reviewYear)
      .eq('is_org_level', true);

    if (fallbackError) throw fallbackError;
    targetKpis = fallbackKpis || [];
  }

  // Fallback 2 (RC3): fuzzy KRA name — master kra_name as substring match
  if (targetKpis.length === 0) {
    const { data: fuzzyKpis, error: fuzzyError } = await supabase
      .from('kpis')
      .select(baseSelect)
      .eq('category_id', categoryId)
      .ilike('kra_name', `%${escapedKra}%`)
      .eq('review_period', reviewPeriod)
      .eq('review_year', reviewYear)
      .eq('is_org_level', true);

    if (fuzzyError) throw fuzzyError;
    targetKpis = fuzzyKpis || [];
  }

  if (targetKpis.length === 0) return [];

  if (scope === 'department' && departmentId) {
    return targetKpis.filter(k => (k.profiles as any)?.department_id === departmentId);
  } else if (scope === 'employee' && employeeId) {
    return targetKpis.filter(k => k.employee_id === employeeId);
  }
  return targetKpis;
}

/**
 * Call the server-side RPC and map results back to PropagationResultWithDetails.
 */
async function callPropagationRpc(
  kpiRatings: any[],
  profileMap: Map<string, any>,
  isNa: boolean,
  remarks?: string | null,
  overwritePolicy: 'safe' | 'pre_review_only' | 'force_pre_terminal' = 'pre_review_only'
): Promise<PropagationResultWithDetails> {
  const { data, error } = await supabase.rpc('propagate_org_kpi_value', {
    p_kpi_ratings: kpiRatings,
    p_is_na: isNa,
    p_remarks: remarks || null,
    p_overwrite_policy: overwritePolicy,
  });

  if (error) throw error;

  const rpcResult = data as any;
  let overwrittenCount = 0;
  const details: PropagationDetail[] = (rpcResult.details || []).map((d: any) => {
    const info = profileMap.get(d.kpi_id);
    const newScore = d.new_score ?? null;
    const oldScore = d.old_score ?? null;
    if (oldScore !== null && newScore !== null && oldScore !== newScore) {
      overwrittenCount += 1;
    }
    return {
      employeeName: info?.fullName || 'Unknown',
      employeeCode: info?.employeeCode || null,
      departmentName: info?.departmentName || null,
      oldScore,
      newScore,
      change: oldScore !== null && newScore !== null ? newScore - oldScore : null,
      priorStatus: d.prior_status ?? null,
    };
  });

  return {
    propagatedCount: rpcResult.propagated_count,
    details,
    skippedCount: rpcResult.skipped_count ?? 0,
    skipped: rpcResult.skipped ?? [],
    overwrittenCount,
  };
}

/**
 * Fire-and-forget audit logging to kpi_audit_logs so entries appear in KpiTimeline.
 */
async function logPropagationAudit(
  kpiRatings: Array<{ kpi_id: string; achieved_value: number | null; self_score: number | null; self_rating: string | null }>,
  isNa?: boolean
) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const auditEntries = kpiRatings.map(r => ({
    kpi_id: r.kpi_id,
    action: 'ORG_KPI_PROPAGATED',
    performed_by: user.id,
    new_value: {
      achieved_value: r.achieved_value,
      self_score: r.self_score,
      self_rating: r.self_rating,
      is_na: !!isNa,
      source: 'org_kpi_data_owner',
    },
  }));

  await supabase.from('kpi_audit_logs').insert(auditEntries);
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
        targetKpis, params.achievedValue, !!params.isNa, params.evidenceUrl
      );

      const result = await callPropagationRpc(
        kpiRatings, profileMap, !!params.isNa, params.remarks, params.overwritePolicy ?? 'pre_review_only'
      );

      // Fire-and-forget: log to kpi_audit_logs for Review Timeline visibility
      logPropagationAudit(kpiRatings, params.isNa).catch(() => {});

      // v2.66.8 — propagate the silent flag through onSuccess via the result
      (result as any).__silent = !!params.silent;
      return result;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['kpis'] });
      queryClient.invalidateQueries({ queryKey: ['my-kpis'] });
      queryClient.invalidateQueries({ queryKey: ['all-kpis'] });
      queryClient.invalidateQueries({ queryKey: ['kpis-by-period'] });
      queryClient.invalidateQueries({ queryKey: ['review-submissions'] });
      queryClient.invalidateQueries({ queryKey: ['org-kpi-values'] });
      // v2.66.8 — caller-driven silence (batch loops emit one summary toast)
      if ((result as any).__silent) return;
      if (result.propagatedCount > 0) {
        const overwroteMsg = result.overwrittenCount && result.overwrittenCount > 0
          ? ` (${result.overwrittenCount} prior self-review value${result.overwrittenCount === 1 ? '' : 's'} overwritten)`
          : '';
        toast({
          title: `Propagated to ${result.propagatedCount} employee KPI(s)${overwroteMsg}`,
          description: result.skippedCount && result.skippedCount > 0
            ? `Review submissions updated. ${result.skippedCount} KPI(s) skipped (locked by reviewer).`
            : 'Review submissions updated with org-level values',
        });
      } else if (result.skippedCount && result.skippedCount > 0) {
        // v2.66.8 — Re-classified per POLICY §88: when employees have already
        // self-reviewed, re-propagation is intentionally blocked (snapshot
        // immutability). This is NOT a failure — surface as informational.
        const skipped = result.skipped || [];
        const allBenign = skipped.length > 0 && skipped.every(
          s => s.reason === 'not_in_kra_set' || s.reason === 'reviewer_locked'
        );
        if (allBenign) {
          toast({
            title: 'Locked by reviewer',
            description: `All ${result.skippedCount} matching KPI(s) have moved into manager/auditor/management review and cannot be overwritten by the data owner.`,
          });
        } else {
          toast({
            title: 'Nothing to propagate',
            description: `${result.skippedCount} KPI(s) could not be advanced (e.g. missing rows or race condition). Please refresh and retry.`,
            variant: 'destructive',
          });
        }
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
          targetKpis, params.achievedValue, !!params.isNa, params.evidenceUrl
        );

        allRatings.push(...kpiRatings);
        profileMap.forEach((v, k) => globalProfileMap.set(k, v));
        if (params.isNa) hasNa = true;
      }

      if (allRatings.length === 0) return { propagatedCount: 0, details: [] };

      const policy = values.find(v => v.overwritePolicy)?.overwritePolicy ?? 'pre_review_only';
      const result = await callPropagationRpc(allRatings, globalProfileMap, hasNa, null, policy);

      // Fire-and-forget: log to kpi_audit_logs for Review Timeline visibility
      logPropagationAudit(allRatings, hasNa).catch(() => {});

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
        const overwroteMsg = result.overwrittenCount && result.overwrittenCount > 0
          ? ` (${result.overwrittenCount} prior value${result.overwrittenCount === 1 ? '' : 's'} overwritten)`
          : '';
        toast({
          title: `Propagated to ${result.propagatedCount} employee KPI(s)${overwroteMsg}`,
          description: result.skippedCount && result.skippedCount > 0
            ? `${result.skippedCount} KPI(s) skipped (locked by reviewer).`
            : undefined,
        });
      } else if (result.skippedCount && result.skippedCount > 0) {
        // v2.66.8 — see usePropagateOrgKpiValue.onSuccess for rationale.
        const skipped = result.skipped || [];
        const allBenign = skipped.length > 0 && skipped.every(
          s => s.reason === 'not_in_kra_set' || s.reason === 'reviewer_locked'
        );
        if (allBenign) {
          toast({
            title: 'Locked by reviewer',
            description: `All ${result.skippedCount} KPI(s) have moved into manager/auditor/management review and cannot be overwritten by the data owner.`,
          });
        } else {
          toast({
            title: 'Nothing to propagate',
            description: `${result.skippedCount} KPI(s) could not be advanced. Please refresh and retry.`,
            variant: 'destructive',
          });
        }
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

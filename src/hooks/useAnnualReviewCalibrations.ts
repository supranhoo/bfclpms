import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface CalibrationRecord {
  instance_id: string;
  calibrated_rating: number;
  calibration_reason: string | null;
  calibrated_at: string | null;
}

/**
 * ADR-220 — calibrations for a set of review instances, keyed by instance id.
 * Read access follows the instance's own visibility (RLS).
 *
 * Use ONLY for small id sets (a single instance, one page of rows). For report
 * surfaces use `useAnnualReviewCycleCalibrations` — a long `.in(...)` list
 * overflows the request URL and silently degrades to "no calibrations"
 * (ADR-244).
 */
export function useAnnualReviewCalibrations(instanceIds: string[]) {
  const key = instanceIds.slice().sort().join(',');
  return useQuery({
    queryKey: ['annual-review-calibrations', key],
    enabled: instanceIds.length > 0,
    staleTime: 30_000,
    queryFn: async (): Promise<Record<string, CalibrationRecord>> => {
      const { data, error } = await supabase
        .from('annual_review_calibrations')
        .select('instance_id, calibrated_rating, reason, updated_at')
        .in('instance_id', instanceIds);
      if (error) throw error;
      const out: Record<string, CalibrationRecord> = {};
      for (const r of data ?? []) {
        out[r.instance_id] = {
          instance_id: r.instance_id,
          calibrated_rating: Number(r.calibrated_rating),
          calibration_reason: r.reason,
          calibrated_at: r.updated_at,
        };
      }
      return out;
    },
  });
}

/**
 * ADR-244 — every calibration in a cycle, keyed by instance id.
 *
 * Cycle-scoped by design: report tabs must never build the filter from a
 * per-row id list, which is what made calibrated ratings invisible on the
 * Comprehensive tab (2,589 ids ≈ 100 KB of URL) and effectively invisible on
 * the paginated Detail tab.
 */
export function useAnnualReviewCycleCalibrations(cycleId: string | undefined) {
  return useQuery({
    queryKey: ['annual-review-calibrations-cycle', cycleId],
    enabled: !!cycleId,
    staleTime: 30_000,
    queryFn: async (): Promise<Record<string, CalibrationRecord>> => {
      const { data, error } = await supabase
        .from('annual_review_calibrations')
        .select('instance_id, calibrated_rating, reason, updated_at, annual_review_instances!inner(cycle_id)')
        .eq('annual_review_instances.cycle_id', cycleId!);
      if (error) throw error;
      const out: Record<string, CalibrationRecord> = {};
      for (const r of (data ?? []) as unknown as Array<{
        instance_id: string; calibrated_rating: number | string; reason: string | null; updated_at: string | null;
      }>) {
        out[r.instance_id] = {
          instance_id: r.instance_id,
          calibrated_rating: Number(r.calibrated_rating),
          calibration_reason: r.reason,
          calibrated_at: r.updated_at,
        };
      }
      return out;
    },
  });
}

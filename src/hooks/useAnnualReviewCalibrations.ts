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

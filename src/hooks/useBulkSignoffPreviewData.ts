/**
 * useBulkSignoffPreviewData — batched fetch of per-employee KPI rules +
 * achieved values for the Bulk Sign-off impact preview (POLICY §111.7.a).
 *
 * - Triggers only while the dialog is open AND a stage sign-off action.
 * - Batches IN-lists at 500 IDs per page (Core memory: handle DB limits with
 *   batched fetching).
 * - Pure read; no mutations.
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { KpiRule } from '@/lib/carriedScoreResolver';

const PAGE = 500;

async function fetchInBatches<T>(
  ids: string[],
  fn: (chunk: string[]) => Promise<T[]>,
): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += PAGE) {
    const chunk = ids.slice(i, i + PAGE);
    if (chunk.length === 0) continue;
    const rows = await fn(chunk);
    out.push(...rows);
  }
  return out;
}

export interface BulkSignoffPreviewData {
  ruleByKpiId: Map<string, KpiRule>;
  achievedBySubmissionId: Map<string, number | string | null>;
}

export function useBulkSignoffPreviewData(
  kpiIds: string[],
  submissionIds: string[],
  enabled: boolean,
) {
  const sortedKpi = [...new Set(kpiIds)].sort();
  const sortedSub = [...new Set(submissionIds)].sort();
  return useQuery({
    enabled: enabled && (sortedKpi.length > 0 || sortedSub.length > 0),
    queryKey: ['bulk_signoff_preview_data', sortedKpi, sortedSub],
    staleTime: 30_000,
    queryFn: async (): Promise<BulkSignoffPreviewData> => {
      const kpiRows = await fetchInBatches(sortedKpi, async (chunk) => {
        const { data, error } = await supabase
          .from('kpis')
          .select('id, weightage, criteria, uom, uom_type, target_value, threshold_mode, r0, r1, r2, r3, r4, r5, qualitative_options')
          .in('id', chunk);
        if (error) throw error;
        return data ?? [];
      });

      const subRows = await fetchInBatches(sortedSub, async (chunk) => {
        const { data, error } = await supabase
          .from('review_submissions')
          .select('id, achieved_value')
          .in('id', chunk);
        if (error) throw error;
        return data ?? [];
      });

      const ruleByKpiId = new Map<string, KpiRule>();
      for (const r of kpiRows) {
        ruleByKpiId.set(r.id, {
          id: r.id,
          weightage: r.weightage as number | null,
          criteria: r.criteria as string | null,
          uom: r.uom as string | null,
          uom_type: r.uom_type as string | null,
          target_value: r.target_value as number | null,
          threshold_mode: r.threshold_mode as string | null,
          r0: r.r0 as string | null, r1: r.r1 as string | null,
          r2: r.r2 as string | null, r3: r.r3 as string | null,
          r4: r.r4 as string | null, r5: r.r5 as string | null,
          qualitative_options: r.qualitative_options,
        });
      }

      const achievedBySubmissionId = new Map<string, number | string | null>();
      for (const r of subRows) {
        achievedBySubmissionId.set(r.id as string, (r.achieved_value as number | null) ?? null);
      }

      return { ruleByKpiId, achievedBySubmissionId };
    },
  });
}
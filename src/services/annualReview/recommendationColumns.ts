/**
 * ADR-182 / POLICY §RPT-RECOMMENDATION-COLUMNS
 *
 * SSOT for the "Overall Recommendation" text authored on the Annual Review
 * form by the Dept Head, BU Head and Management stages.
 *
 * The comprehensive report RPC only aggregates per-stage `notes`; the
 * recommendation lives in `annual_review_responses.qualitative_responses`
 * under `__overall_recommendation`. `get_annual_review_recommendations`
 * exposes it with the same access scope as the report itself.
 */
import { supabase } from '@/integrations/supabase/client';
import { fetchAllRpcPaged } from '@/lib/fetchAll';

export interface RecommendationRow {
  instance_id: string;
  dept_head_recommendation: string | null;
  bu_head_recommendation: string | null;
  management_recommendation: string | null;
}

export type RecommendationMap = Record<string, Omit<RecommendationRow, 'instance_id'>>;

/** Pure — index RPC rows by instance id. */
export function indexRecommendations(rows: RecommendationRow[]): RecommendationMap {
  const out: RecommendationMap = {};
  for (const r of rows ?? []) {
    if (!r?.instance_id) continue;
    out[r.instance_id] = {
      dept_head_recommendation: r.dept_head_recommendation ?? null,
      bu_head_recommendation: r.bu_head_recommendation ?? null,
      management_recommendation: r.management_recommendation ?? null,
    };
  }
  return out;
}

/** Pure — merge recommendations onto report rows without mutating inputs. */
export function mergeRecommendations<T extends { instance_id: string }>(
  rows: T[],
  map: RecommendationMap,
): T[] {
  return (rows ?? []).map((r) => ({ ...r, ...(map[r.instance_id] ?? {}) }));
}

export async function fetchRecommendations(cycleId: string): Promise<RecommendationMap> {
  if (!cycleId) return {};
  const rows = await fetchAllRpcPaged<RecommendationRow>((from, to) =>
    (supabase as any)
      .rpc('get_annual_review_recommendations', { p_cycle_id: cycleId })
      .range(from, to),
  );
  return indexRecommendations(rows);
}

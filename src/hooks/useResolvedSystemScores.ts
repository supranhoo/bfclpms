import { useQueries } from '@tanstack/react-query';
import type { AnnualReviewTemplate, CarryKraConfig } from '@/types/annualReview';
import { buildCarrySnapshot } from '@/services/annualReview/carryKraScore';

/**
 * Resolve the system-score map used for *display* on the employee/team pages.
 *
 * `instance.system_scores` is the persisted map, but `carry_kra` sources are
 * computed client-side by `CarryKraScoreCard` and only land in the persisted
 * map when an editor calls `onChangeValue` — which the read-only employee /
 * reviewer surfaces never do. This hook overlays a live `buildCarrySnapshot`
 * result on top of the persisted map so the composition card sees the same
 * number the card already shows.
 *
 * Query keys MUST match `CarryKraScoreCard` exactly so the TanStack cache
 * dedupes the network call.
 */
export function useResolvedSystemScores(
  template: AnnualReviewTemplate | null | undefined,
  instance: { employee_id?: string | null; system_scores?: Record<string, number> | null } | null | undefined,
  fiscalYear: number | undefined,
): { values: Record<string, number>; isLoading: boolean } {
  const systemScores = template?.sections.system_scores ?? [];
  const employeeId = instance?.employee_id ?? undefined;
  const enabled = !!employeeId && typeof fiscalYear === 'number';

  const carryEntries = systemScores.filter((s) => s.source === 'carry_kra');

  const queries = useQueries({
    queries: carryEntries.map((s) => {
      const cfg: CarryKraConfig = s.carry_config ?? { aggregation: 'overall_avg', excludeNa: true };
      const weight = Number(s.weight) || 0;
      return {
        queryKey: ['carryKraScore', employeeId, fiscalYear, cfg, weight] as const,
        queryFn: () => buildCarrySnapshot(employeeId!, fiscalYear!, cfg, weight),
        enabled,
        staleTime: 60_000,
      };
    }),
  });

  const base = instance?.system_scores ?? {};
  const out: Record<string, number> = { ...base };
  carryEntries.forEach((s, i) => {
    const snap = queries[i]?.data;
    if (snap && typeof snap.value === 'number') out[s.id] = snap.value;
  });

  const isLoading = queries.some((q) => q.isLoading);
  return { values: out, isLoading };
}
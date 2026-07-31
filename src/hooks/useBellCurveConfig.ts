import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { DEFAULT_BELL_CURVE_CONFIG, type BellCurveConfig } from '@/lib/annualReview/bellCurve';

const KEY = (cycleId?: string) => ['annual-review-bell-curve-config', cycleId ?? 'global'];

function mapRow(r: Record<string, unknown>): BellCurveConfig {
  return {
    id: r.id as string,
    cycle_id: (r.cycle_id as string | null) ?? null,
    target_5: Number(r.target_5),
    target_4: Number(r.target_4),
    target_3: Number(r.target_3),
    target_2: Number(r.target_2),
    target_1: Number(r.target_1),
    green_threshold: Number(r.green_threshold),
    amber_threshold: Number(r.amber_threshold),
    exempted_slab_cap_enabled: (r.exempted_slab_cap_enabled as boolean | null) ?? true,
    exempted_top_tiers_excluded: Number(r.exempted_top_tiers_excluded ?? 2),
  };
}

/**
 * ADR-218 — cycle-scoped bell curve targets with a global fallback row, and a
 * final in-code default so the dashboard never renders without a target.
 */
export function useBellCurveConfig(cycleId?: string) {
  return useQuery<BellCurveConfig>({
    queryKey: KEY(cycleId),
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('annual_review_bell_curve_config')
        .select('id, cycle_id, target_5, target_4, target_3, target_2, target_1, green_threshold, amber_threshold, exempted_slab_cap_enabled, exempted_top_tiers_excluded, is_active')
        .eq('is_active', true);
      if (error) throw error;
      const rows = (data ?? []) as Array<Record<string, unknown>>;
      const scoped = cycleId ? rows.find((r) => r.cycle_id === cycleId) : undefined;
      const global = rows.find((r) => r.cycle_id === null);
      const picked = scoped ?? global;
      return picked ? mapRow(picked) : { ...DEFAULT_BELL_CURVE_CONFIG };
    },
  });
}

export function useSaveBellCurveConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (config: BellCurveConfig) => {
      const { data: userRes } = await supabase.auth.getUser();
      const payload = {
        cycle_id: config.cycle_id,
        target_5: config.target_5,
        target_4: config.target_4,
        target_3: config.target_3,
        target_2: config.target_2,
        target_1: config.target_1,
        green_threshold: config.green_threshold,
        amber_threshold: config.amber_threshold,
        exempted_slab_cap_enabled: config.exempted_slab_cap_enabled ?? true,
        exempted_top_tiers_excluded: config.exempted_top_tiers_excluded ?? 2,
        is_active: true,
        updated_by: userRes?.user?.id ?? null,
      };
      if (config.id) {
        const { error } = await supabase
          .from('annual_review_bell_curve_config')
          .update(payload)
          .eq('id', config.id);
        if (error) throw error;
        return;
      }
      const { error } = await supabase
        .from('annual_review_bell_curve_config')
        .insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['annual-review-bell-curve-config'] });
    },
  });
}
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  signatureKey,
  type CanonicalSignature,
  type CanonicalResolution,
} from '@/lib/canonicalGrouping';

/**
 * Phase 2a: Cross-month canonical KPI resolver hook.
 *
 * Calls the `resolve_canonical_kpi_batch` RPC with the given signatures and
 * returns a Map keyed by `signatureKey(sig)` for O(1) lookup in render code.
 *
 * - Read-only. No writes, no schema mutation.
 * - 10 minute staleTime — registry changes infrequently and any newly
 *   approved canonical entry will refresh on next mount.
 * - Deduplicates input signatures by their normalized key before sending,
 *   so callers can pass raw row arrays without pre-grouping.
 * - Empty input returns an empty Map without hitting the network.
 */

interface ResolverRow {
  category_id: string;
  kra_name: string;
  kpi_name: string;
  definition_id: string | null;
  canonical_kra_name: string | null;
  canonical_kpi_name: string | null;
}

function dedupeSignatures(sigs: CanonicalSignature[]): CanonicalSignature[] {
  const seen = new Set<string>();
  const out: CanonicalSignature[] = [];
  for (const s of sigs) {
    if (!s.category_id || !s.kra_name || !s.kpi_name) continue;
    const key = signatureKey(s);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out;
}

export function useCanonicalResolver(signatures: CanonicalSignature[]) {
  const unique = dedupeSignatures(signatures);
  // Stable cache key: sorted normalized signature keys. Two callers with the
  // same set of KPIs (different order) hit the same cache entry.
  const cacheKey = unique.map(signatureKey).sort().join('§');

  return useQuery<Map<string, CanonicalResolution>>({
    queryKey: ['canonical-resolver', cacheKey],
    queryFn: async () => {
      if (unique.length === 0) return new Map();
      const payload = unique.map(s => ({
        category_id: s.category_id,
        kra_name: s.kra_name,
        kpi_name: s.kpi_name,
      }));
      const { data, error } = await (supabase as any).rpc(
        'resolve_canonical_kpi_batch',
        { p_signatures: payload },
      );
      if (error) {
        // Don't blow up the page — degrade gracefully to "no resolutions" so
        // every row falls back to its raw key. Loud console for diagnostics.
        console.warn('[useCanonicalResolver] RPC failed, falling back to raw grouping:', error.message);
        return new Map();
      }
      const map = new Map<string, CanonicalResolution>();
      for (const row of (data ?? []) as ResolverRow[]) {
        map.set(
          signatureKey({
            category_id: row.category_id,
            kra_name: row.kra_name,
            kpi_name: row.kpi_name,
          }),
          {
            definition_id: row.definition_id,
            canonical_kra_name: row.canonical_kra_name,
            canonical_kpi_name: row.canonical_kpi_name,
          },
        );
      }
      return map;
    },
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: 1,
    // Always run, even with 0 sigs, to keep the hook order stable.
  });
}
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCanonicalResolver } from '@/hooks/useCanonicalResolver';
import { signatureKey } from '@/lib/canonicalGrouping';
import type { KPI } from '@/hooks/useKpis';

/**
 * Canonical-aware "related KPIs" matcher.
 *
 * Why this exists
 * ---------------
 * After the KPI Standardization rollout (May 2026+), monthly rows for the
 * SAME canonical KPI may carry different `(kra_name, kpi_name)` text — the
 * current month uses the canonical text, prior months still hold the alias
 * text they were created with. UI surfaces that aggregate a KPI across
 * periods (History card, Tracker Sheet, etc.) MUST resolve those rows via
 * the canonical definition + alias list, NEVER via strict string equality.
 *
 * This file provides:
 *  - {@link useCanonicalVariantPairs}  — React Query hook returning every
 *    `(kra_name, kpi_name)` pair (canonical + aliases) for the KPI's
 *    canonical definition. Returns `[]` when the KPI has no canonical entry,
 *    in which case callers fall back to strict equality.
 *  - {@link matchesCanonicalKpi}       — pure predicate used by callers'
 *    `Array.filter` on `allKpis`.
 *
 * See POLICY.md §88I and `mem/features/admin/kpi-standardization-registry`.
 */

export interface VariantPair {
  kra_name: string;
  kpi_name: string;
}

const norm = (s: string | null | undefined): string =>
  (s ?? '').trim().toLowerCase();

/**
 * Resolve every `(kra_name, kpi_name)` variant for a KPI's canonical
 * definition. Mirrors the logic embedded in `KpiJourneySection` so all
 * canonical-aware surfaces stay in sync.
 */
export function useCanonicalVariantPairs(
  kpi: Pick<KPI, 'category_id' | 'kra_name' | 'kpi_name'> | null | undefined,
) {
  const signatures = useMemo(
    () =>
      kpi?.category_id && kpi?.kra_name && kpi?.kpi_name
        ? [{
            category_id: kpi.category_id,
            kra_name: kpi.kra_name,
            kpi_name: kpi.kpi_name,
          }]
        : [],
    [kpi?.category_id, kpi?.kra_name, kpi?.kpi_name],
  );

  const { data: resolverMap } = useCanonicalResolver(signatures);

  const definitionId = kpi?.category_id && kpi?.kra_name && kpi?.kpi_name
    ? resolverMap?.get(
        signatureKey({
          category_id: kpi.category_id,
          kra_name: kpi.kra_name,
          kpi_name: kpi.kpi_name,
        }),
      )?.definition_id ?? null
    : null;

  return useQuery<VariantPair[]>({
    queryKey: ['canonical-variants', definitionId],
    queryFn: async () => {
      if (!definitionId) return [];
      const [defRes, aliasRes] = await Promise.all([
        supabase
          .from('kpi_definitions')
          .select('canonical_kra_name, canonical_kpi_name')
          .eq('id', definitionId)
          .maybeSingle(),
        supabase
          .from('kpi_name_aliases')
          .select('variant_kra_name, variant_kpi_name')
          .eq('definition_id', definitionId),
      ]);
      const out: VariantPair[] = [];
      if (defRes.data) {
        out.push({
          kra_name: defRes.data.canonical_kra_name,
          kpi_name: defRes.data.canonical_kpi_name,
        });
      }
      for (const a of aliasRes.data ?? []) {
        out.push({ kra_name: a.variant_kra_name, kpi_name: a.variant_kpi_name });
      }
      return out;
    },
    enabled: !!definitionId,
    staleTime: 10 * 60 * 1000,
  });
}

/**
 * Pure predicate. `row` matches the current KPI's canonical group when:
 *   - same employee, AND
 *   - if `variantPairs` is non-empty: row's `(kra_name, kpi_name)` is one of
 *     the canonical/alias variants (case + whitespace insensitive),
 *   - otherwise: strict equality on `kra_name` AND `kpi_name` (legacy
 *     fallback for KPIs not yet in the registry).
 */
export function matchesCanonicalKpi(
  row: Pick<KPI, 'employee_id' | 'kra_name' | 'kpi_name'>,
  current: Pick<KPI, 'employee_id' | 'kra_name' | 'kpi_name'>,
  variantPairs: VariantPair[],
): boolean {
  if (row.employee_id !== current.employee_id) return false;
  if (variantPairs.length === 0) {
    return row.kra_name === current.kra_name && row.kpi_name === current.kpi_name;
  }
  const rk = norm(row.kra_name);
  const rp = norm(row.kpi_name);
  return variantPairs.some(
    (v) => norm(v.kra_name) === rk && norm(v.kpi_name) === rp,
  );
}

/**
 * Identify the "canonical" pair (preferred display variant) for tie-breaking
 * when multiple alias rows exist for the same period. Returns the first
 * entry of `variantPairs` (the resolver always pushes the canonical pair
 * first), or null if empty.
 */
export function canonicalPair(variantPairs: VariantPair[]): VariantPair | null {
  return variantPairs[0] ?? null;
}

/**
 * Pick the preferred row for a (period, year) bucket when more than one
 * alias variant exists. Preference order:
 *   1. Row matching the canonical pair exactly.
 *   2. Row whose id matches `currentKpiId` (the row the user clicked from).
 *   3. First row encountered (stable input order).
 */
export function preferredVariantRow<
  T extends { id: string; kra_name: string; kpi_name: string },
>(
  rows: T[],
  variantPairs: VariantPair[],
  currentKpiId: string | null,
): T {
  if (rows.length === 1) return rows[0];
  const canon = canonicalPair(variantPairs);
  if (canon) {
    const ck = norm(canon.kra_name);
    const cp = norm(canon.kpi_name);
    const match = rows.find(
      (r) => norm(r.kra_name) === ck && norm(r.kpi_name) === cp,
    );
    if (match) return match;
  }
  if (currentKpiId) {
    const cur = rows.find((r) => r.id === currentKpiId);
    if (cur) return cur;
  }
  return rows[0];
}
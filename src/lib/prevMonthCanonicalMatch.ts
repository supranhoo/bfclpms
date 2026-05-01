/**
 * Phase 3b: Pure helper for KpiJourneySection's previous-month KPI lookup.
 *
 * The lookup queries `kpis` with `.in('kra_name', ...)` and `.in('kpi_name', ...)`
 * across all canonical variants. Because Postgres treats those as independent
 * IN-clauses, the result can include false positives like (kraA + kpiB) when
 * the registry only blesses (kraA + kpiA) and (kraB + kpiB).
 *
 * This helper keeps only rows whose (kra_name, kpi_name) is an actual variant
 * pair listed in the registry (or the row's own original pair when the KPI is
 * not yet registered).
 */

import { nk } from './canonicalGrouping';

export interface VariantPair {
  kra_name: string;
  kpi_name: string;
}

export interface PrevKpiRow {
  kra_name: string;
  kpi_name: string;
}

/** Build a normalized lookup set of legal variant pairs. */
export function buildPairKeySet(pairs: VariantPair[]): Set<string> {
  const out = new Set<string>();
  for (const p of pairs) {
    out.add(`${nk(p.kra_name)}|${nk(p.kpi_name)}`);
  }
  return out;
}

/** Returns true if a fetched row's pair is allowed by the variant set. */
export function isAllowedPair(row: PrevKpiRow, pairKeys: Set<string>): boolean {
  return pairKeys.has(`${nk(row.kra_name)}|${nk(row.kpi_name)}`);
}

/** Returns true if the row uses a different name than the current KPI. */
export function isRenamedFromCurrent(
  row: PrevKpiRow,
  current: PrevKpiRow,
): boolean {
  return nk(row.kra_name) !== nk(current.kra_name) || nk(row.kpi_name) !== nk(current.kpi_name);
}
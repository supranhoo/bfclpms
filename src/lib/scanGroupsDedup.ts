/**
 * Defensive de-duplication for KPI duplicate-scanner output.
 *
 * The scanner SQL returns one entry per distinct (kra_name, kpi_name) per
 * group. Historically a join bug caused the same variant to be repeated by its
 * row_count. This helper guarantees the UI never re-introduces that bug, even
 * if a stale function or future regression slips in.
 */
export interface ScannerVariant {
  kra_name: string;
  kpi_name: string;
  employee_count: number;
  row_count: number;
  match_type?: 'exact' | 'fuzzy';
  similarity?: number;
  // Scale & context metadata (mode across underlying kpis rows).
  frequency?: string | null;
  criteria?: string | null;
  uom?: string | null;
  r0?: string | null;
  r1?: string | null;
  r2?: string | null;
  r3?: string | null;
  r4?: string | null;
  r5?: string | null;
  // "Mixed" flags — true when underlying kpis rows disagree on this field.
  frequency_mixed?: boolean;
  criteria_mixed?: boolean;
  uom_mixed?: boolean;
  r0_mixed?: boolean;
  r1_mixed?: boolean;
  r2_mixed?: boolean;
  r3_mixed?: boolean;
  r4_mixed?: boolean;
  r5_mixed?: boolean;
}

export interface ScannerGroup {
  normalized_kpi: string;
  category_id: string;
  category_name: string;
  variants: ScannerVariant[];
  is_skipped?: boolean;
  has_fuzzy?: boolean;
}

const variantKey = (v: { kra_name: string; kpi_name: string }) =>
  `${(v.kra_name || '').trim().toLowerCase()}||${(v.kpi_name || '').trim().toLowerCase()}`;

export function dedupeVariants(variants: ScannerVariant[]): ScannerVariant[] {
  const map = new Map<string, ScannerVariant>();
  for (const v of variants) {
    const k = variantKey(v);
    const existing = map.get(k);
    if (!existing) {
      map.set(k, { ...v });
    } else {
      // Same variant appeared more than once — keep the larger of each count
      // to avoid double-counting from a row-multiplied source.
      existing.employee_count = Math.max(existing.employee_count, v.employee_count);
      existing.row_count = Math.max(existing.row_count, v.row_count);
      // Prefer 'exact' over 'fuzzy', and the higher similarity score, when
      // collapsing two snapshots of the same variant from different scans.
      if (v.match_type === 'exact' && existing.match_type !== 'exact') {
        existing.match_type = 'exact';
      }
      if (typeof v.similarity === 'number') {
        existing.similarity = Math.max(existing.similarity ?? 0, v.similarity);
      }
    }
  }
  return [...map.values()];
}

export function dedupeScannerGroups<G extends ScannerGroup>(groups: G[]): G[] {
  return groups.map(g => ({ ...g, variants: dedupeVariants(g.variants) }));
}

/**
 * Phase 2a: Canonical grouping utilities.
 *
 * The KPI Standardization Registry (kpi_definitions + kpi_name_aliases) lets
 * historic KPI variants ("Control dust emission", "Control Dust Emission",
 * "Environment compliance") resolve to a single canonical definition_id.
 *
 * These helpers convert raw KPI rows into stable grouping keys so that
 * cross-month / cross-variant aggregation collapses correctly without
 * mutating any historical row.
 *
 * Design rules:
 * - Pure functions, no side effects, no React imports.
 * - When a row resolves to a definition_id, the key is `def:<uuid>`.
 * - When a row does not resolve, the key falls back to a normalized
 *   `raw:<categoryId>|<nk(kra)>|<nk(kpi)>` so unmatched rows still group
 *   sensibly with themselves.
 *
 * `nk()` (normalize key) = lowercase + trim + collapse internal whitespace.
 * Mirrors the client-side normalization used by the Org KPI suite memory.
 */

export interface CanonicalSignature {
  category_id: string;
  kra_name: string;
  kpi_name: string;
}

export interface CanonicalResolution {
  definition_id: string | null;
  canonical_kra_name: string | null;
  canonical_kpi_name: string | null;
}

/** Lowercase, trim, collapse internal whitespace runs to a single space. */
export function nk(value: string | null | undefined): string {
  return (value ?? '').toLowerCase().trim().replace(/\s+/g, ' ');
}

/** Stable signature key for a Map lookup. */
export function signatureKey(sig: CanonicalSignature): string {
  return `${sig.category_id}|${nk(sig.kra_name)}|${nk(sig.kpi_name)}`;
}

/**
 * Returns the canonical grouping key for one KPI row.
 * Prefers the resolver match; falls back to a normalized raw signature.
 */
export function canonicalGroupKey(
  sig: CanonicalSignature,
  resolverMap: Map<string, CanonicalResolution>,
): string {
  const resolution = resolverMap.get(signatureKey(sig));
  if (resolution?.definition_id) {
    return `def:${resolution.definition_id}`;
  }
  return `raw:${signatureKey(sig)}`;
}

/**
 * Returns the human-friendly display names for a row, preferring canonical
 * names when a registry match exists, otherwise the row's own text.
 */
export function canonicalDisplayNames(
  sig: CanonicalSignature,
  resolverMap: Map<string, CanonicalResolution>,
): { kra_name: string; kpi_name: string; isCanonical: boolean } {
  const resolution = resolverMap.get(signatureKey(sig));
  if (resolution?.definition_id && resolution.canonical_kra_name && resolution.canonical_kpi_name) {
    return {
      kra_name: resolution.canonical_kra_name,
      kpi_name: resolution.canonical_kpi_name,
      isCanonical: true,
    };
  }
  return {
    kra_name: sig.kra_name,
    kpi_name: sig.kpi_name,
    isCanonical: false,
  };
}

/**
 * Group an array of rows by canonical key. Each row must expose a
 * CanonicalSignature; the group key is computed via `canonicalGroupKey`.
 * Returns a Map preserving first-seen insertion order.
 */
export function groupByCanonicalKey<T extends { signature: CanonicalSignature }>(
  rows: T[],
  resolverMap: Map<string, CanonicalResolution>,
): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const row of rows) {
    const key = canonicalGroupKey(row.signature, resolverMap);
    const bucket = out.get(key);
    if (bucket) bucket.push(row);
    else out.set(key, [row]);
  }
  return out;
}

/**
 * Build a list of "also known as" alias texts for a canonical group, useful
 * for tooltips like: `Control Dust Emission (also known as: Environment
 * compliance, Control dust emission)`.
 */
export function aliasesForGroup<T extends { signature: CanonicalSignature }>(
  rows: T[],
  canonicalKra: string | null,
  canonicalKpi: string | null,
): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const row of rows) {
    const display = `${row.signature.kra_name} / ${row.signature.kpi_name}`;
    const key = nk(display);
    if (seen.has(key)) continue;
    seen.add(key);
    if (
      canonicalKra &&
      canonicalKpi &&
      nk(row.signature.kra_name) === nk(canonicalKra) &&
      nk(row.signature.kpi_name) === nk(canonicalKpi)
    ) {
      continue; // skip the canonical text itself
    }
    result.push(display);
  }
  return result;
}
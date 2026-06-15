/**
 * Canonical key normalisation for Org-level KPI lookups.
 *
 * Used by every place that needs to match a KRA/KPI definition across
 * the `kpis`, `org_kpi_data_owners`, and `org_kpi_values` tables.
 *
 * Contract (ADR-054):
 *   - strip carriage returns
 *   - lowercase
 *   - collapse all runs of whitespace to a single ASCII space
 *   - trim leading/trailing whitespace
 *
 * The same normalisation MUST be applied on both sides of any join,
 * otherwise rows that differ only in whitespace/CR/case will silently
 * fail to match (the root cause of the May 2026 propagation bug).
 */
export function normalizeText(s: string | null | undefined): string {
  if (!s) return '';
  return s.replace(/\r/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

export function normalizeKpiKey(
  categoryId: string,
  kraName: string,
  kpiName: string
): string {
  return `${categoryId}||${normalizeText(kraName)}||${normalizeText(kpiName)}`;
}

export function findCanonicalKpiSignature(
  candidates: Array<{ kra_name: string | null; kpi_name: string | null }> | null | undefined,
  kraName: string,
  kpiName: string
): { kraName: string; kpiName: string } {
  const requestedKra = normalizeText(kraName);
  const requestedKpi = normalizeText(kpiName);
  const match = (candidates || []).find(
    candidate => normalizeText(candidate.kra_name) === requestedKra && normalizeText(candidate.kpi_name) === requestedKpi,
  );

  return {
    kraName: match?.kra_name ?? kraName,
    kpiName: match?.kpi_name ?? kpiName,
  };
}

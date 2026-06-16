/**
 * SSOT predicate: does this KPI carry an automated scoring mechanism that
 * the UI can drive from achieved value / Yes-No / tier selection?
 *
 * Numeric KPIs require at least one R0..R5 threshold defined.
 * Binary / Tiered KPIs require non-empty `qualitative_options` (R0..R5 are
 * not used for these uom types).
 *
 * POLICY §BULK-REVIEW-SCORING-PARITY — the Bulk Review cell drawer MUST
 * mirror the single-cell scorecard. Manual 0–5 entry is only allowed as an
 * explicit reviewer override, or when this predicate returns `false`.
 */
export function kpiHasScoringLogic(kpi: {
  uom_type?: string | null;
  qualitative_options?: unknown[] | null;
  r0?: string | null;
  r1?: string | null;
  r2?: string | null;
  r3?: string | null;
  r4?: string | null;
  r5?: string | null;
} | null | undefined): boolean {
  if (!kpi) return false;
  const uom = kpi.uom_type ?? 'numeric';
  if (uom === 'binary' || uom === 'tiered') {
    return Array.isArray(kpi.qualitative_options) && kpi.qualitative_options.length > 0;
  }
  return [kpi.r0, kpi.r1, kpi.r2, kpi.r3, kpi.r4, kpi.r5]
    .some((v) => v !== null && v !== undefined && v !== '');
}
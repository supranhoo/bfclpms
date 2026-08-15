/**
 * ADR-271 — Single source of truth for "how is this KPI scored?".
 *
 * The system carries three KPI types and every surface that displays or
 * influences a score must render the right one:
 *   - numeric  → R5…R0 threshold bands
 *   - binary   → the KPI's own two options (Yes/No, Pass/Fail, and inverted
 *                safety variants where No = 5)
 *   - tiered   → the KPI's own tier list
 * A qualitative KPI must never be presented as a bare 0–5 threshold scale.
 */
import {
  BINARY_OPTIONS,
  type QualitativeOption,
  type UomType,
} from '@/lib/qualitativeUom';

export type KpiScoringModelType = 'numeric' | 'binary' | 'tiered' | 'unconfigured';

export interface KpiScoringModel {
  /** Declared KPI type, independent of whether it is configured. */
  uomType: UomType;
  /** What the UI should render. `unconfigured` = nothing usable is set up. */
  type: KpiScoringModelType;
  /** Qualitative options sorted high → low rating. Empty for numeric. */
  options: QualitativeOption[];
  /** Numeric threshold bands, blanks removed, R5 first. Empty for qualitative. */
  thresholds: Array<{ key: 'r5' | 'r4' | 'r3' | 'r2' | 'r1' | 'r0'; label: string; value: string }>;
}

export interface KpiScoringInput {
  uom_type?: string | null;
  qualitative_options?: unknown;
  r0?: string | number | null;
  r1?: string | number | null;
  r2?: string | number | null;
  r3?: string | number | null;
  r4?: string | number | null;
  r5?: string | number | null;
}

export const KPI_TYPE_LABELS: Record<UomType, string> = {
  numeric: 'Value based',
  binary: 'Yes / No',
  tiered: 'Tiered',
};

function readOptions(raw: unknown): QualitativeOption[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((o): o is QualitativeOption =>
      !!o && typeof o === 'object' && typeof (o as any).label === 'string')
    .map(o => ({
      label: o.label,
      rating: Number((o as any).rating ?? 0),
      definition: (o as any).definition ?? '',
    }));
}

export function resolveKpiScoringModel(kpi: KpiScoringInput | null | undefined): KpiScoringModel {
  const uomType = ((kpi?.uom_type || 'numeric') as UomType);

  if (uomType === 'binary' || uomType === 'tiered') {
    let options = readOptions(kpi?.qualitative_options);
    // Binary falls back to the canonical Yes/No pair; a stored (possibly
    // inverted) list always wins so safety KPIs keep No = 5.
    if (options.length === 0 && uomType === 'binary') options = [...BINARY_OPTIONS];
    return {
      uomType,
      type: options.length > 0 ? uomType : 'unconfigured',
      options: [...options].sort((a, b) => b.rating - a.rating),
      thresholds: [],
    };
  }

  const thresholds = (['r5', 'r4', 'r3', 'r2', 'r1', 'r0'] as const)
    .map(key => ({ key, label: key.toUpperCase(), value: kpi?.[key] == null ? '' : String(kpi[key]) }))
    .filter(t => t.value.trim() !== '');

  return {
    uomType: 'numeric',
    type: thresholds.length > 0 ? 'numeric' : 'unconfigured',
    options: [],
    thresholds,
  };
}

/** Convert a qualitative option label to its 0–5 rating; null when unknown. */
export function labelToRatingFromModel(model: KpiScoringModel, label: string | null): number | null {
  if (!label) return null;
  const hit = model.options.find(o => o.label === label);
  return hit ? hit.rating : null;
}

/**
 * True when a group of KPI rows sharing one title is set up with more than one
 * type. Group writes must refuse these — one value cannot mean both a number
 * and a Yes/No answer.
 */
export function isMixedScoringGroup(uomTypes: unknown): boolean {
  if (!Array.isArray(uomTypes)) return false;
  const set = new Set(uomTypes.map(t => String(t || 'numeric')));
  return set.size > 1;
}

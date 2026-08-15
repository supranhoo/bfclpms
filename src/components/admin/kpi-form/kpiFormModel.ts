/**
 * ADR-272 — Single source of truth for the KPI definition form.
 *
 * Both entry points ("Assign New KRA" = AdminKpiCreateDialog and
 * "Admin KPI Editor" = AdminKpiEditorForm) build their write payload through
 * these helpers so the two forms can never drift again.
 *
 * POLICY §KPI-DEFINITION-FORM-PARITY.
 */
import { UomType, QualitativeOption, BINARY_OPTIONS, BINARY_OPTIONS_INVERTED, validateQualitativeOptions } from '@/lib/qualitativeUom';
import { composeKpiName, splitKpiText } from '@/lib/kpiTextSplit';

export type ThresholdMode = 'absolute' | 'ratio';

/**
 * ADR-274a / POLICY §KPI-THRESHOLD-MODE-ABSOLUTE-ONLY.
 *
 * `ratio` is legacy: no live KPI row uses it and no new KPI may be written
 * with it. The scoring engine keeps its ratio branch so historical rows score
 * identically, but every form writes `absolute` for numeric KPIs.
 */
export const DEFAULT_THRESHOLD_MODE: ThresholdMode = 'absolute';

/** Scoring direction, stored on `kpis.criteria`. */
export const KPI_DIRECTION_OPTIONS = [
  'Higher is Better',
  'Lower is Better',
  'Equal to Target',
] as const;
export type KpiDirection = (typeof KPI_DIRECTION_OPTIONS)[number];

/**
 * True when the direction contradicts the R5..R0 ladder — e.g. "Higher is
 * Better" with a descending ladder. Mirrors the Scoring Health Check rule.
 */
export function directionConflictsWithLadder(
  direction: string | null | undefined,
  r5: string | null | undefined,
  r1: string | null | undefined,
): boolean {
  const a = parseFloat(String(r5 ?? '').replace('%', ''));
  const b = parseFloat(String(r1 ?? '').replace('%', ''));
  if (!isFinite(a) || !isFinite(b) || a === b) return false;
  const d = (direction ?? '').toLowerCase();
  if (d.includes('lower')) return a > b;
  if (d.includes('higher')) return a < b;
  return false;
}

export interface KpiScoringState {
  uom_type: UomType;
  threshold_mode: ThresholdMode;
  qualitative_options: QualitativeOption[];
  r5: string;
  r4: string;
  r3: string;
  r2: string;
  r1: string;
  r0: string;
}

export interface KpiTextState {
  kpi_name: string;
  kpi_title: string;
  kpi_description: string;
  kpi_formula: string;
  kpi_scoring_logic: string;
}

const trimOrNull = (v: string | null | undefined): string | null => {
  const t = (v ?? '').trim();
  return t.length > 0 ? t : null;
};

/** Scoring columns, with everything that does not apply to the type nulled. */
export function buildScoringPayload(state: KpiScoringState) {
  const numeric = state.uom_type === 'numeric';
  return {
    uom_type: state.uom_type,
    // Forward-only: numeric KPIs are always written as absolute (ADR-274a).
    threshold_mode: numeric ? DEFAULT_THRESHOLD_MODE : null,
    r5: numeric ? trimOrNull(state.r5) : null,
    r4: numeric ? trimOrNull(state.r4) : null,
    r3: numeric ? trimOrNull(state.r3) : null,
    r2: numeric ? trimOrNull(state.r2) : null,
    r1: numeric ? trimOrNull(state.r1) : null,
    r0: numeric ? trimOrNull(state.r0) : null,
    qualitative_options:
      state.uom_type === 'tiered' || state.uom_type === 'binary'
        ? state.qualitative_options
        : null,
  };
}

/**
 * Structured text columns (ADR-269). `kpi_name` stays the join key: when the
 * admin fills the structured fields we recompose the legacy text from them so
 * historical joins, reports and scorecards keep matching.
 */
export function buildTextPayload(state: KpiTextState) {
  const title = trimOrNull(state.kpi_title);
  const description = trimOrNull(state.kpi_description);
  const formula = trimOrNull(state.kpi_formula);
  const scoring = trimOrNull(state.kpi_scoring_logic);

  if (!title) {
    // Unsplit legacy entry — keep the free text exactly as typed.
    return {
      kpi_name: (state.kpi_name ?? '').trim(),
      kpi_title: null,
      kpi_description: null,
      kpi_formula: null,
      kpi_scoring_logic: null,
    };
  }

  return {
    kpi_name: composeKpiName({ title, description, formula, scoring_logic: scoring }),
    kpi_title: title,
    kpi_description: description,
    kpi_formula: formula,
    kpi_scoring_logic: scoring,
  };
}

/** Seed the structured fields from a KPI row (or a template / library pick). */
export function textStateFromRow(row: {
  kpi_name?: string | null;
  kpi_title?: string | null;
  kpi_description?: string | null;
  kpi_formula?: string | null;
  kpi_scoring_logic?: string | null;
} | null | undefined): KpiTextState {
  const name = row?.kpi_name ?? '';
  if (trimOrNull(row?.kpi_title)) {
    return {
      kpi_name: name,
      kpi_title: row?.kpi_title ?? '',
      kpi_description: row?.kpi_description ?? '',
      kpi_formula: row?.kpi_formula ?? '',
      kpi_scoring_logic: row?.kpi_scoring_logic ?? '',
    };
  }
  return {
    kpi_name: name,
    kpi_title: '',
    kpi_description: '',
    kpi_formula: '',
    kpi_scoring_logic: '',
  };
}

/** Suggest a split for an unsplit KPI name (used by the "Split text" action). */
export function suggestTextState(kpiName: string): KpiTextState {
  const parts = splitKpiText(kpiName);
  return {
    kpi_name: kpiName,
    kpi_title: parts.title ?? '',
    kpi_description: parts.description ?? '',
    kpi_formula: parts.formula ?? '',
    kpi_scoring_logic: parts.scoring_logic ?? '',
  };
}

/** Shared validation both forms must enforce (previously editor-only). */
export function validateScoringState(state: KpiScoringState): string | null {
  if (state.uom_type === 'tiered') {
    return validateQualitativeOptions(state.qualitative_options);
  }
  if (state.uom_type === 'binary' && state.qualitative_options.length !== 2) {
    return 'Yes / No KPIs must define exactly two options.';
  }
  return null;
}

export const binaryOptionsFor = (inverted: boolean): QualitativeOption[] =>
  inverted ? BINARY_OPTIONS_INVERTED : BINARY_OPTIONS;

/**
 * ADR-358 — KPI-Employee Matrix structured text resolution.
 *
 * Pure helpers so the matrix report renders the *updated* (structured) KRA/KPI
 * wording produced by the Performance Console, falling back byte-for-byte to
 * the legacy `kpi_name` text when a row has no structured fields.
 *
 * Display only: `kpi_name` stays the matching key everywhere else.
 */
import { resolveKpiText } from '@/lib/kpiTextSplit';

export interface MatrixRawKpiRow {
  kra_name: string | null;
  kpi_name: string | null;
  description?: string | null;
  kpi_title?: string | null;
  kpi_description?: string | null;
  kpi_formula?: string | null;
  kpi_scoring_logic?: string | null;
}

export interface MatrixKpiText {
  /** Resolved display title — never blank. */
  title: string;
  description: string;
  formula: string;
  scoringLogic: string;
  isStructured: boolean;
}

/** Resolve the four display blocks for one matrix KPI row. */
export function resolveMatrixKpiText(row: MatrixRawKpiRow): MatrixKpiText {
  const parts = resolveKpiText({
    kpi_name: row.kpi_name,
    kpi_title: row.kpi_title,
    kpi_description: row.kpi_description,
    kpi_formula: row.kpi_formula,
    kpi_scoring_logic: row.kpi_scoring_logic,
  });
  return {
    title: (parts.title || row.kpi_name || '').trim(),
    description: (parts.description || row.description || '').toString().trim(),
    formula: (parts.formula || '').trim(),
    scoringLogic: (parts.scoring_logic || '').trim(),
    isStructured: parts.isStructured,
  };
}

/** Normalisation used for row de-duplication (display grouping only). */
export function normalizeMatrixKey(v: string | null | undefined): string {
  return (v ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
}

/**
 * Row identity for the matrix pivot. Legacy name variants that resolve to the
 * same title inside the same category + KRA collapse onto one row.
 */
export function matrixRowKey(
  categoryId: string | null | undefined,
  kraName: string | null | undefined,
  displayTitle: string | null | undefined,
): string {
  return `${categoryId ?? ''}|${normalizeMatrixKey(kraName)}|${normalizeMatrixKey(displayTitle)}`;
}

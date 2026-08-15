/**
 * ADR-269 — forward-only KPI text split (Title / Description / Formula / Scoring Logic).
 *
 * TS mirror of `public.kpi_split_text(text)`. Both MUST produce identical
 * splits — see `src/test/kpiTextSplit.test.ts`.
 *
 * Cutover: only KPIs whose fiscal (July) start year is >= 2026 are structured.
 * Legacy rows keep the single free-text `kpi_name` and render through the
 * existing `textFormatting` parser, byte-for-byte unchanged.
 *
 * `kpi_name` is a live matching key (org_kpi_values join, aliases, duplicate
 * constraint) and is NEVER rewritten by the split. New authoring composes
 * `kpi_name` from the parts so downstream name matching keeps working.
 */

export const KPI_SPLIT_CUTOVER_FY_START = 2026;

export type KpiSplitConfidence = 'high' | 'review' | 'unparsed' | 'empty';

export interface KpiTextParts {
  title: string | null;
  description: string | null;
  formula: string | null;
  scoring_logic: string | null;
  confidence: KpiSplitConfidence;
}

const H1 = ['July', 'August', 'September', 'October', 'November', 'December'];
const H2 = ['January', 'February', 'March', 'April', 'May', 'June'];

/** Fiscal (July) start year of a KPI row. Mirrors `public.kpi_fiscal_start_year`. */
export function kpiFiscalStartYear(
  period: string | null | undefined,
  year: number | null | undefined,
): number | null {
  if (!period || year == null) return null;
  if (H1.includes(period)) return year;
  if (H2.includes(period)) return year - 1;
  return null;
}

/** True when this KPI belongs to the new (structured) assessment year. */
export function isStructuredKpiPeriod(
  period: string | null | undefined,
  year: number | null | undefined,
): boolean {
  const fy = kpiFiscalStartYear(period, year);
  return fy !== null && fy >= KPI_SPLIT_CUTOVER_FY_START;
}

const SCORING_RE = /(?:^|\n|\s|-)\s*scoring(?:\s+logic)?\s*[:\-]+\s*([\s\S]*)$/i;
const FORMULA_RE = /(?:^|\n|\s|-)\s*formula\s*[:\-]+\s*([\s\S]*)$/i;
const LEAD_DESC_RE = /^[\s\-]*description\s*[:\-]+\s*/i;

function nullIfBlank(v: string | null | undefined): string | null {
  const t = (v ?? '').trim();
  return t === '' ? null : t;
}

/** Split raw KPI text into its structured parts. Pure; never throws. */
export function splitKpiText(raw: string | null | undefined): KpiTextParts {
  if (!raw || raw.trim() === '') {
    return { title: null, description: null, formula: null, scoring_logic: null, confidence: 'empty' };
  }

  const scoringMatch = raw.match(SCORING_RE);
  const scoring = nullIfBlank(scoringMatch?.[1]);
  const head = scoringMatch ? raw.slice(0, scoringMatch.index ?? raw.length) : raw;

  const formulaMatch = head.match(FORMULA_RE);
  const formula = nullIfBlank(formulaMatch?.[1]);
  const head2 = formulaMatch ? head.slice(0, formulaMatch.index ?? head.length) : head;

  const firstLine = head2.split('\n')[0];
  const title = nullIfBlank(firstLine.trim().replace(/^-\s*/, ''));
  const description = nullIfBlank(head2.slice(firstLine.length).trim().replace(LEAD_DESC_RE, ''));

  let confidence: KpiSplitConfidence;
  if (formula && scoring && title && title.length <= 120) confidence = 'high';
  else if (!formula && !scoring) confidence = 'unparsed';
  else confidence = 'review';

  return { title, description, formula, scoring_logic: scoring, confidence };
}

/**
 * Compose the canonical `kpi_name` text from structured parts, in the format
 * the rest of the system already stores and parses.
 */
export function composeKpiName(parts: {
  title?: string | null;
  description?: string | null;
  formula?: string | null;
  scoring_logic?: string | null;
}): string {
  const lines: string[] = [];
  const title = (parts.title ?? '').trim();
  if (title) lines.push(title);
  const d = (parts.description ?? '').trim();
  if (d) lines.push(`- Description: ${d}`);
  const f = (parts.formula ?? '').trim();
  if (f) lines.push(`- Formula: ${f}`);
  const s = (parts.scoring_logic ?? '').trim();
  if (s) lines.push(`- Scoring Logic: ${s}`);
  return lines.join('\n');
}

export interface KpiLikeRow {
  kpi_name?: string | null;
  kpi_title?: string | null;
  kpi_description?: string | null;
  kpi_formula?: string | null;
  kpi_scoring_logic?: string | null;
}

/**
 * Display resolver: structured columns when present, otherwise parse the
 * legacy free text. Guarantees legacy rows render exactly as before.
 */
export function resolveKpiText(row: KpiLikeRow | null | undefined): KpiTextParts & { isStructured: boolean } {
  if (!row) {
    return { title: null, description: null, formula: null, scoring_logic: null, confidence: 'empty', isStructured: false };
  }
  if (nullIfBlank(row.kpi_title)) {
    return {
      title: nullIfBlank(row.kpi_title),
      description: nullIfBlank(row.kpi_description),
      formula: nullIfBlank(row.kpi_formula),
      scoring_logic: nullIfBlank(row.kpi_scoring_logic),
      confidence: 'high',
      isStructured: true,
    };
  }
  return { ...splitKpiText(row.kpi_name), isStructured: false };
}

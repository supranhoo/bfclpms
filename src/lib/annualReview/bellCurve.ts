/**
 * ADR-218 / POLICY §AR-BELL-CURVE — Bell Curve Analysis engine.
 *
 * Pure, dependency-free calculation layer shared by the dashboard, the manager
 * view and the exports. Ratings come from the ADR-212 SSOT
 * (`toRatingOutOf5(total_score)`); this module only bands, aggregates and
 * compares them against the admin-configured target distribution.
 */
import { toRatingOutOf5 } from './ratingSlab';

export type RatingBand = 1 | 2 | 3 | 4 | 5;
export type ComplianceLevel = 'green' | 'amber' | 'red';

export const BAND_LABELS: Record<RatingBand, string> = {
  5: 'Outstanding',
  4: 'Exceeds Expectations',
  3: 'Meets Expectations',
  2: 'Needs Improvement',
  1: 'Unsatisfactory',
};

/** Left-to-right chart order (lowest → highest). */
export const BAND_ORDER: RatingBand[] = [1, 2, 3, 4, 5];

export interface BellCurveConfig {
  id?: string;
  cycle_id: string | null;
  target_5: number;
  target_4: number;
  target_3: number;
  target_2: number;
  target_1: number;
  green_threshold: number;
  amber_threshold: number;
}

export const DEFAULT_BELL_CURVE_CONFIG: BellCurveConfig = {
  cycle_id: null,
  target_5: 10,
  target_4: 20,
  target_3: 40,
  target_2: 20,
  target_1: 10,
  green_threshold: 5,
  amber_threshold: 10,
};

export function targetFor(config: BellCurveConfig, band: RatingBand): number {
  switch (band) {
    case 5: return Number(config.target_5) || 0;
    case 4: return Number(config.target_4) || 0;
    case 3: return Number(config.target_3) || 0;
    case 2: return Number(config.target_2) || 0;
    default: return Number(config.target_1) || 0;
  }
}

export function targetsSum(config: BellCurveConfig): number {
  return round1(BAND_ORDER.reduce((acc, b) => acc + targetFor(config, b), 0));
}

export function validateConfig(config: BellCurveConfig): string | null {
  for (const b of BAND_ORDER) {
    const t = targetFor(config, b);
    if (!Number.isFinite(t) || t < 0 || t > 100) return `Target for ${BAND_LABELS[b]} must be between 0 and 100.`;
  }
  if (Math.abs(targetsSum(config) - 100) > 0.05) return `Targets must total 100% (currently ${targetsSum(config)}%).`;
  const g = Number(config.green_threshold);
  const a = Number(config.amber_threshold);
  if (!Number.isFinite(g) || g <= 0) return 'Green threshold must be greater than 0.';
  if (!Number.isFinite(a) || a <= g) return 'Amber threshold must be greater than the green threshold.';
  return null;
}

/** Minimal row shape the engine needs — a subset of ComprehensiveRow. */
export interface BellCurveInput {
  instance_id: string;
  employee_code: string | null;
  employee_name: string | null;
  designation?: string | null;
  department_id?: string | null;
  department_name?: string | null;
  business_unit_id?: string | null;
  business_unit_name?: string | null;
  division_id?: string | null;
  division_name?: string | null;
  manager_id?: string | null;
  manager_name?: string | null;
  total_score: number | null;
  is_excluded?: boolean;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** A /5 rating → its band. 4.25 → 4, 4.5 → 5 (nearest, clamped to 1..5). */
export function bandForRating(rating: number | null | undefined): RatingBand | null {
  if (rating === null || rating === undefined || !Number.isFinite(rating)) return null;
  const rounded = Math.round(rating);
  const clamped = Math.min(5, Math.max(1, rounded));
  return clamped as RatingBand;
}

export function ratingOf(row: BellCurveInput): number | null {
  return toRatingOutOf5(row.total_score);
}

/** Non-excluded, rated employees only — the distribution denominator. */
export function ratedRows(rows: BellCurveInput[]): Array<BellCurveInput & { rating: number; band: RatingBand }> {
  const out: Array<BellCurveInput & { rating: number; band: RatingBand }> = [];
  for (const r of rows) {
    if (r.is_excluded) continue;
    const rating = ratingOf(r);
    const band = bandForRating(rating);
    if (rating === null || band === null) continue;
    out.push({ ...r, rating, band });
  }
  return out;
}

export function complianceFor(variance: number, config: BellCurveConfig): ComplianceLevel {
  const abs = Math.abs(variance);
  if (abs <= Number(config.green_threshold)) return 'green';
  if (abs <= Number(config.amber_threshold)) return 'amber';
  return 'red';
}

export interface BandRow {
  band: RatingBand;
  label: string;
  count: number;
  actualPct: number;
  targetPct: number;
  targetCount: number;
  variancePct: number;
  compliance: ComplianceLevel;
}

export function computeDistribution(rows: BellCurveInput[], config: BellCurveConfig): BandRow[] {
  const rated = ratedRows(rows);
  const denom = rated.length;
  const counts = new Map<RatingBand, number>();
  for (const r of rated) counts.set(r.band, (counts.get(r.band) ?? 0) + 1);

  return BAND_ORDER.map((band) => {
    const count = counts.get(band) ?? 0;
    const actualPct = denom > 0 ? round1((count / denom) * 100) : 0;
    const targetPct = targetFor(config, band);
    const variancePct = round1(actualPct - targetPct);
    return {
      band,
      label: BAND_LABELS[band],
      count,
      actualPct,
      targetPct,
      targetCount: Math.round((targetPct / 100) * denom),
      variancePct,
      compliance: complianceFor(variancePct, config),
    };
  });
}

export interface BellCurveSummary {
  totalEmployees: number;
  ratedEmployees: number;
  unratedEmployees: number;
  averageRating: number | null;
  highestBandCount: number;
  lowestBandCount: number;
  /** % of bands within the green threshold, weighted by target share. */
  compliancePct: number;
  greenBands: number;
  amberBands: number;
  redBands: number;
}

export function computeSummary(rows: BellCurveInput[], config: BellCurveConfig): BellCurveSummary {
  const eligible = rows.filter((r) => !r.is_excluded);
  const rated = ratedRows(rows);
  const bands = computeDistribution(rows, config);
  const avg = rated.length > 0 ? round2(rated.reduce((a, r) => a + r.rating, 0) / rated.length) : null;
  const green = bands.filter((b) => b.compliance === 'green').length;
  const amber = bands.filter((b) => b.compliance === 'amber').length;
  const red = bands.filter((b) => b.compliance === 'red').length;
  return {
    totalEmployees: eligible.length,
    ratedEmployees: rated.length,
    unratedEmployees: eligible.length - rated.length,
    averageRating: avg,
    highestBandCount: bands.find((b) => b.band === 5)?.count ?? 0,
    lowestBandCount: bands.find((b) => b.band === 1)?.count ?? 0,
    compliancePct: round1((green / BAND_ORDER.length) * 100),
    greenBands: green,
    amberBands: amber,
    redBands: red,
  };
}

export type GroupKey = 'department' | 'business_unit' | 'division' | 'manager';

function groupIdentity(row: BellCurveInput, key: GroupKey): { id: string; name: string } {
  switch (key) {
    case 'department': return { id: row.department_id ?? 'unknown', name: row.department_name ?? 'Unassigned' };
    case 'business_unit': return { id: row.business_unit_id ?? 'unknown', name: row.business_unit_name ?? 'Unassigned' };
    case 'division': return { id: row.division_id ?? 'unknown', name: row.division_name ?? 'Unassigned' };
    default: return { id: row.manager_id ?? 'unknown', name: row.manager_name ?? 'Unassigned' };
  }
}

export interface GroupDistribution {
  id: string;
  name: string;
  summary: BellCurveSummary;
  bands: BandRow[];
  worstCompliance: ComplianceLevel;
}

export function groupDistribution(
  rows: BellCurveInput[],
  key: GroupKey,
  config: BellCurveConfig,
): GroupDistribution[] {
  const buckets = new Map<string, { name: string; rows: BellCurveInput[] }>();
  for (const row of rows) {
    if (row.is_excluded) continue;
    const { id, name } = groupIdentity(row, key);
    const bucket = buckets.get(id) ?? { name, rows: [] };
    bucket.rows.push(row);
    buckets.set(id, bucket);
  }
  return Array.from(buckets.entries())
    .map(([id, bucket]) => {
      const bands = computeDistribution(bucket.rows, config);
      const worst: ComplianceLevel = bands.some((b) => b.compliance === 'red')
        ? 'red'
        : bands.some((b) => b.compliance === 'amber')
          ? 'amber'
          : 'green';
      return {
        id,
        name: bucket.name,
        summary: computeSummary(bucket.rows, config),
        bands,
        worstCompliance: worst,
      };
    })
    .sort((a, b) => b.summary.ratedEmployees - a.summary.ratedEmployees);
}

export interface NormalizationHint {
  band: RatingBand;
  label: string;
  direction: 'over' | 'under';
  people: number;
  message: string;
}

/** Plain-language normalization suggestions for a manager / group. */
export function normalizationHints(bands: BandRow[], config: BellCurveConfig): NormalizationHint[] {
  const hints: NormalizationHint[] = [];
  for (const b of bands) {
    if (b.compliance === 'green') continue;
    const delta = b.count - b.targetCount;
    if (delta === 0) continue;
    const over = delta > 0;
    const people = Math.abs(delta);
    const neighbour = over
      ? BAND_LABELS[(b.band === 1 ? 2 : (b.band - 1)) as RatingBand]
      : BAND_LABELS[(b.band === 5 ? 4 : (b.band + 1)) as RatingBand];
    hints.push({
      band: b.band,
      label: b.label,
      direction: over ? 'over' : 'under',
      people,
      message: over
        ? `${people} employee${people > 1 ? 's' : ''} above target in ${b.label} (${b.actualPct}% vs ${b.targetPct}%) — consider moving to ${neighbour}.`
        : `${people} employee${people > 1 ? 's' : ''} below target in ${b.label} (${b.actualPct}% vs ${b.targetPct}%) — review candidates currently in ${neighbour}.`,
    });
  }
  return hints.sort((a, b) => b.people - a.people);
}

/** Department × band matrix for the heat map. */
export interface HeatmapRow {
  id: string;
  name: string;
  total: number;
  cells: Array<{ band: RatingBand; count: number; pct: number; variancePct: number; compliance: ComplianceLevel }>;
}

export function heatmapMatrix(
  rows: BellCurveInput[],
  key: GroupKey,
  config: BellCurveConfig,
): HeatmapRow[] {
  return groupDistribution(rows, key, config).map((g) => ({
    id: g.id,
    name: g.name,
    total: g.summary.ratedEmployees,
    cells: g.bands.map((b) => ({
      band: b.band,
      count: b.count,
      pct: b.actualPct,
      variancePct: b.variancePct,
      compliance: b.compliance,
    })),
  }));
}

/**
 * Smooth normal curve sampled across the 1..5 axis, scaled so its peak matches
 * the tallest target bar. Used purely for the visual overlay.
 */
export function targetCurvePoints(
  config: BellCurveConfig,
  denom: number,
  samples = 41,
): Array<{ x: number; y: number }> {
  const mean = BAND_ORDER.reduce((a, b) => a + b * targetFor(config, b), 0) / 100;
  const variance = BAND_ORDER.reduce((a, b) => a + targetFor(config, b) * (b - mean) ** 2, 0) / 100;
  const sd = Math.sqrt(Math.max(variance, 0.0001));
  const peakTarget = Math.max(...BAND_ORDER.map((b) => targetFor(config, b)));
  const peakCount = (peakTarget / 100) * denom;
  const pdf = (x: number) => Math.exp(-((x - mean) ** 2) / (2 * sd * sd));
  const out: Array<{ x: number; y: number }> = [];
  for (let i = 0; i < samples; i++) {
    const x = 1 + (4 * i) / (samples - 1);
    out.push({ x: round2(x), y: round2(pdf(x) * peakCount) });
  }
  return out;
}
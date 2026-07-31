/**
 * ADR-218 / POLICY §AR-BELL-CURVE — Bell Curve Analysis engine.
 *
 * Pure, dependency-free calculation layer shared by the dashboard, the manager
 * view and the exports. Ratings come from the ADR-212 SSOT
 * (`toRatingOutOf5(total_score)`); this module only bands, aggregates and
 * compares them against the admin-configured target distribution.
 */
import {
  DEFAULT_RATING_SLABS,
  describeSlab,
  resolveSlab,
  toRatingOutOf5,
  type RatingSlab,
} from './ratingSlab';

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
  /** PMS grade text (profiles.pms_grade) for ADR-219 grade filtering. */
  grade?: string | null;
  /** ADR-218a — 'With KRA' | 'Blended' | 'Without KRA' (report RPC `scoring_mode`). */
  scoring_mode?: string | null;
  /** KRA pool weight; fallback when `scoring_mode` is absent. */
  kra_weight?: number | null;
  total_score: number | null;
  is_excluded?: boolean;
  /** ADR-179 stage ratings (/5) surfaced in the heat map drill-down. */
  dept_head_rating_5?: number | null;
  bu_head_rating_5?: number | null;
  /** ADR-220 — admin calibration of the final rating. */
  calibrated_rating?: number | null;
  calibration_reason?: string | null;
  calibrated_by_name?: string | null;
  calibrated_at?: string | null;
}

/** ADR-218a — KRA / Non-KRA scoring source filter values. */
export type ScoringSource = 'kra' | 'blended' | 'non_kra';

export const SCORING_SOURCE_LABELS: Record<ScoringSource, string> = {
  kra: 'With KRA',
  blended: 'Blended',
  non_kra: 'Without KRA',
};

/** Canonical order for the Scoring Source dropdown. */
export const SCORING_SOURCE_ORDER: ScoringSource[] = ['kra', 'blended', 'non_kra'];

/**
 * Normalises the report's `scoring_mode` text into a filter value. Falls back
 * to `kra_weight` when the mode is missing so no employee disappears from both
 * the KRA and the Non-KRA selection.
 */
export function scoringSourceOf(row: BellCurveInput): ScoringSource {
  const mode = (row.scoring_mode ?? '').trim().toLowerCase();
  if (mode === 'with kra') return 'kra';
  if (mode === 'blended') return 'blended';
  if (mode === 'without kra') return 'non_kra';
  return (Number(row.kra_weight) || 0) > 0 ? 'kra' : 'non_kra';
}

export function matchesScoringSource(row: BellCurveInput, source: ScoringSource | null): boolean {
  if (!source) return true;
  return scoringSourceOf(row) === source;
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

/* ------------------------------------------------------------------ *
 * ADR-218b — band modes: rating bands (1..5) or increment slab bands.
 * ------------------------------------------------------------------ */

export type BandMode = 'rating' | 'slab';

export const BAND_MODE_LABELS: Record<BandMode, string> = {
  rating: 'Rating bands',
  slab: 'Slab %',
};

/** One column / bucket of a distribution, independent of the band mode. */
export interface BandDef {
  /** Stable identity used for sorting, keys and map lookups. */
  key: string;
  /** Primary label, e.g. "Outstanding" or "12%". */
  label: string;
  /** Secondary label, e.g. "(5)" or "3.50 – under 4.00". */
  sub: string;
  /** Target share of the population; null when the mode has no targets. */
  targetPct: number | null;
}

/** Rating-mode band definitions, lowest → highest. */
export function ratingBandDefs(config: BellCurveConfig): BandDef[] {
  return BAND_ORDER.map((band) => ({
    key: String(band),
    label: BAND_LABELS[band],
    sub: `(${band})`,
    targetPct: targetFor(config, band),
  }));
}

function activeSlabs(slabs: ReadonlyArray<RatingSlab>): RatingSlab[] {
  const active = slabs.filter((s) => s.is_active !== false);
  const base = active.length > 0 ? active : (DEFAULT_RATING_SLABS as RatingSlab[]);
  return base.slice().sort((a, b) => a.rating_from - b.rating_from);
}

export function slabBandKey(slab: RatingSlab): string {
  return `slab:${slab.rating_from}`;
}

/** Slab-mode band definitions, lowest → highest. No targets are defined. */
export function slabBandDefs(slabs: ReadonlyArray<RatingSlab> = DEFAULT_RATING_SLABS): BandDef[] {
  return activeSlabs(slabs).map((s) => ({
    key: slabBandKey(s),
    label: `${Number(s.increment_percent)}%`,
    sub: describeSlab(s),
    targetPct: null,
  }));
}

/** Resolved banding strategy shared by every chart, table and export. */
export interface Banding {
  mode: BandMode;
  defs: BandDef[];
  /** Bucket key for a /5 rating, or null when it falls outside every band. */
  keyOf: (rating: number) => string | null;
  hasTargets: boolean;
}

export function makeBanding(
  mode: BandMode,
  config: BellCurveConfig,
  slabs: ReadonlyArray<RatingSlab> = DEFAULT_RATING_SLABS,
): Banding {
  if (mode === 'slab') {
    const resolved = activeSlabs(slabs);
    return {
      mode,
      defs: slabBandDefs(resolved),
      keyOf: (rating) => {
        const slab = resolveSlab(rating, resolved);
        return slab ? slabBandKey(slab) : null;
      },
      hasTargets: false,
    };
  }
  return {
    mode: 'rating',
    defs: ratingBandDefs(config),
    keyOf: (rating) => {
      const band = bandForRating(rating);
      return band === null ? null : String(band);
    },
    hasTargets: true,
  };
}

/** A single distribution row. Target fields are null when the mode has no targets. */
export interface DistRow {
  key: string;
  label: string;
  sub: string;
  count: number;
  actualPct: number;
  targetPct: number | null;
  targetCount: number | null;
  variancePct: number | null;
  compliance: ComplianceLevel | null;
}

/** Rating-mode row — keeps the numeric band for legacy consumers. */
export interface BandRow extends DistRow {
  band: RatingBand;
}

export function computeBands(
  rows: BellCurveInput[],
  banding: Banding,
  config: BellCurveConfig,
): DistRow[] {
  const rated = ratedRows(rows);
  const denom = rated.length;
  const counts = new Map<string, number>();
  for (const r of rated) {
    const key = banding.keyOf(r.rating);
    if (key === null) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return banding.defs.map((def) => {
    const count = counts.get(def.key) ?? 0;
    const actualPct = denom > 0 ? round1((count / denom) * 100) : 0;
    if (def.targetPct === null) {
      return { ...def, count, actualPct, targetCount: null, variancePct: null, compliance: null };
    }
    const variancePct = round1(actualPct - def.targetPct);
    return {
      ...def,
      count,
      actualPct,
      targetCount: Math.round((def.targetPct / 100) * denom),
      variancePct,
      compliance: complianceFor(variancePct, config),
    };
  });
}

/** Rating-mode distribution (ADR-218 behaviour, unchanged). */
export function computeDistribution(rows: BellCurveInput[], config: BellCurveConfig): BandRow[] {
  return computeBands(rows, makeBanding('rating', config), config)
    .map((r) => ({ ...r, band: Number(r.key) as RatingBand }));
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
  /** Number of bands with at least one employee (used when no targets exist). */
  bandsInUse: number;
  /** Labels of the top / bottom band, so KPI cards stay mode-agnostic. */
  highestBandLabel: string;
  lowestBandLabel: string;
}

export function summarize(
  rows: BellCurveInput[],
  banding: Banding,
  config: BellCurveConfig,
): BellCurveSummary {
  const eligible = rows.filter((r) => !r.is_excluded);
  const rated = ratedRows(rows);
  const bands = computeBands(rows, banding, config);
  const avg = rated.length > 0 ? round2(rated.reduce((a, r) => a + r.rating, 0) / rated.length) : null;
  const green = bands.filter((b) => b.compliance === 'green').length;
  const amber = bands.filter((b) => b.compliance === 'amber').length;
  const red = bands.filter((b) => b.compliance === 'red').length;
  const top = bands[bands.length - 1];
  const bottom = bands[0];
  return {
    totalEmployees: eligible.length,
    ratedEmployees: rated.length,
    unratedEmployees: eligible.length - rated.length,
    averageRating: avg,
    highestBandCount: top?.count ?? 0,
    lowestBandCount: bottom?.count ?? 0,
    highestBandLabel: top ? `${top.label} ${top.sub}` : '—',
    lowestBandLabel: bottom ? `${bottom.label} ${bottom.sub}` : '—',
    compliancePct: bands.length > 0 ? round1((green / bands.length) * 100) : 0,
    greenBands: green,
    amberBands: amber,
    redBands: red,
    bandsInUse: bands.filter((b) => b.count > 0).length,
  };
}

/** Rating-mode summary (ADR-218 behaviour, unchanged). */
export function computeSummary(rows: BellCurveInput[], config: BellCurveConfig): BellCurveSummary {
  return summarize(rows, makeBanding('rating', config), config);
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
  bands: DistRow[];
  worstCompliance: ComplianceLevel | null;
}

export function groupBands(
  rows: BellCurveInput[],
  key: GroupKey,
  banding: Banding,
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
      const bands = computeBands(bucket.rows, banding, config);
      const worst: ComplianceLevel | null = !banding.hasTargets
        ? null
        : bands.some((b) => b.compliance === 'red')
          ? 'red'
          : bands.some((b) => b.compliance === 'amber')
            ? 'amber'
            : 'green';
      return {
        id,
        name: bucket.name,
        summary: summarize(bucket.rows, banding, config),
        bands,
        worstCompliance: worst,
      };
    })
    .sort((a, b) => b.summary.ratedEmployees - a.summary.ratedEmployees);
}

/** Rating-mode grouping (ADR-218 behaviour, unchanged). */
export function groupDistribution(
  rows: BellCurveInput[],
  key: GroupKey,
  config: BellCurveConfig,
): GroupDistribution[] {
  return groupBands(rows, key, makeBanding('rating', config), config);
}

export interface NormalizationHint {
  band: RatingBand;
  label: string;
  direction: 'over' | 'under';
  people: number;
  message: string;
}

/** Plain-language normalization suggestions for a manager / group. */
export function normalizationHints(bands: BandRow[], _config: BellCurveConfig): NormalizationHint[] {
  const hints: NormalizationHint[] = [];
  for (const b of bands) {
    if (b.compliance === 'green' || b.compliance === null || b.targetCount === null) continue;
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
  cells: Array<{
    key: string;
    count: number;
    pct: number;
    variancePct: number | null;
    compliance: ComplianceLevel | null;
  }>;
}

export function heatmapBands(
  rows: BellCurveInput[],
  key: GroupKey,
  banding: Banding,
  config: BellCurveConfig,
): HeatmapRow[] {
  return groupBands(rows, key, banding, config).map((g) => ({
    id: g.id,
    name: g.name,
    total: g.summary.ratedEmployees,
    cells: g.bands.map((b) => ({
      key: b.key,
      count: b.count,
      pct: b.actualPct,
      variancePct: b.variancePct,
      compliance: b.compliance,
    })),
  }));
}

/** Rating-mode heat map (ADR-218 behaviour, unchanged). */
export function heatmapMatrix(
  rows: BellCurveInput[],
  key: GroupKey,
  config: BellCurveConfig,
): HeatmapRow[] {
  return heatmapBands(rows, key, makeBanding('rating', config), config);
}

/* ------------------------------------------------------------------ *
 * ADR-218c — heat map cell drill-down.
 * ------------------------------------------------------------------ */

export interface BandEmployee extends BellCurveInput {
  rating: number;
  band: RatingBand;
}

/**
 * Every rated employee that a single heat map cell counts. Reuses `ratedRows`
 * and `banding.keyOf` so the list length always equals the cell count in both
 * rating and slab modes.
 */
export function employeesInBand(
  rows: BellCurveInput[],
  key: GroupKey,
  groupId: string,
  banding: Banding,
  bandKey: string,
): BandEmployee[] {
  return ratedRows(rows)
    .filter((r) => groupIdentity(r, key).id === groupId && banding.keyOf(r.rating) === bandKey)
    .sort((a, b) => b.rating - a.rating);
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
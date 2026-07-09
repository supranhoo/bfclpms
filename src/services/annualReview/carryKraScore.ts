import { supabase } from '@/integrations/supabase/client';
import type {
  CarryKraConfig, CarryKraMonthly, CarryKraSnapshot,
} from '@/types/annualReview';
import { KPI_SCALE_MAX } from '@/lib/annualReview/fiscalYear';

/** Fiscal year months (July → June). */
export const FY_MONTHS = [
  'July', 'August', 'September', 'October', 'November', 'December',
  'January', 'February', 'March', 'April', 'May', 'June',
] as const;
export type FyMonth = typeof FY_MONTHS[number];

/** Calendar year of a given fiscal month inside fiscal year `fyStart` (July starts in fyStart). */
export function calendarYearForMonth(month: string, fyStart: number): number {
  const idx = FY_MONTHS.indexOf(month as FyMonth);
  // July..December → fyStart, January..June → fyStart + 1
  return idx < 6 ? fyStart : fyStart + 1;
}

type RawRow = {
  kpi_id: string;
  is_na: boolean | null;
  final_score: number | null;
  manager_score: number | null;
  auditor_score: number | null;
  self_score: number | null;
  kpis: {
    employee_id: string;
    review_period: string;
    review_year: number;
    weightage: number | null;
  } | null;
};

/** Picks the most authoritative score available (final → auditor → manager → self). */
export function pickScore(r: Pick<RawRow, 'final_score' | 'auditor_score' | 'manager_score' | 'self_score'>): number | null {
  if (r.final_score != null) return Number(r.final_score);
  if (r.auditor_score != null) return Number(r.auditor_score);
  if (r.manager_score != null) return Number(r.manager_score);
  if (r.self_score != null) return Number(r.self_score);
  return null;
}

/** Pure aggregation — exported for tests. */
export function aggregateMonthly(
  rows: RawRow[],
  fyStart: number,
  excludeNa = true,
): CarryKraMonthly[] {
  // Bucket by month
  const buckets = new Map<string, { weighted: number; weight: number; count: number }>();
  for (const m of FY_MONTHS) buckets.set(m, { weighted: 0, weight: 0, count: 0 });

  for (const r of rows) {
    if (!r.kpis) continue;
    const month = r.kpis.review_period;
    if (!buckets.has(month)) continue;
    if (calendarYearForMonth(month, fyStart) !== Number(r.kpis.review_year)) continue;
    if (excludeNa && r.is_na) continue;
    const score = pickScore(r);
    if (score == null) continue;
    const w = Number(r.kpis.weightage ?? 0) || 1;
    const b = buckets.get(month)!;
    b.weighted += score * w;
    b.weight += w;
    b.count += 1;
  }

  return FY_MONTHS.map((month) => {
    const b = buckets.get(month)!;
    const hasData = b.count > 0 && b.weight > 0;
    const avg = hasData ? +(b.weighted / b.weight).toFixed(2) : null;
    const totalScore = hasData ? +b.weighted.toFixed(2) : null;
    const outOf = hasData ? +(b.weight * KPI_SCALE_MAX).toFixed(2) : null;
    const percentage = hasData ? +((b.weighted / (b.weight * KPI_SCALE_MAX)) * 100).toFixed(2) : null;
    return { month, avg, kpiCount: b.count, totalScore, outOf, percentage };
  });
}

/** Pick months that the config asks for. */
export function selectMonths(monthly: CarryKraMonthly[], cfg: CarryKraConfig): CarryKraMonthly[] {
  if (cfg.aggregation === 'last_n_months' && cfg.lastN && cfg.lastN > 0) {
    return monthly.slice(-cfg.lastN);
  }
  if (cfg.aggregation === 'selected_months' && cfg.months?.length) {
    const set = new Set(cfg.months);
    return monthly.filter((m) => set.has(m.month));
  }
  return monthly; // overall_avg
}

/**
 * Average of monthly KPI ratings (0..KPI_SCALE_MAX), ignoring null months.
 * This is the **raw rating** — NOT yet scaled to the system score's weight.
 */
export function computeCarryRating(monthly: CarryKraMonthly[], cfg: CarryKraConfig): number {
  const chosen = selectMonths(monthly, cfg).filter((m) => m.avg != null);
  if (chosen.length === 0) return 0;
  const sum = chosen.reduce((a, m) => a + (m.avg ?? 0), 0);
  return +(sum / chosen.length).toFixed(2);
}

/**
 * Scaled contribution in percentage points fed into the appraisal total.
 *   contribution = (rating / KPI_SCALE_MAX) * weight
 *
 * SSOT scaling lives here so system_scores[<id>] never contains a raw 0..5
 * mini-value masquerading as percentage points (see POLICY.md).
 */
export function computeCarryContribution(rating: number, weight: number): number {
  if (!Number.isFinite(rating) || !Number.isFinite(weight) || weight <= 0) return 0;
  const v = (rating / KPI_SCALE_MAX) * weight;
  return +v.toFixed(2);
}

/** Back-compat: legacy name, returns raw rating (0..KPI_SCALE_MAX). */
export function computeCarryValue(monthly: CarryKraMonthly[], cfg: CarryKraConfig): number {
  return computeCarryRating(monthly, cfg);
}

/** Fetch raw submissions + KPI metadata for an employee for the fiscal year window. */
export async function fetchMonthlyKraScores(
  employeeId: string,
  fyStart: number,
  excludeNa = true,
): Promise<CarryKraMonthly[]> {
  // Fiscal year July fyStart → June fyStart+1.
  // KPI rows are stamped with calendar `review_year` per month.
  //
  // NOTE: we query `kpis` first (indexed on employee_id, review_year) and
  // embed `review_submissions`. The previous shape started from
  // `review_submissions` and filtered via an embedded `kpis!inner` on
  // employee_id — that forced Postgres to scan a very large table before
  // filtering and triggered "canceling statement due to statement timeout"
  // for employees with many historical submissions (BUG-CARRY-TIMEOUT).
  const { data, error } = await supabase
    .from('kpis')
    .select(`
      id, employee_id, review_period, review_year, weightage,
      review_submissions ( is_na, final_score, manager_score, auditor_score, self_score )
    `)
    .eq('employee_id', employeeId)
    .in('review_year', [fyStart, fyStart + 1]);

  if (error) throw error;

  // Flatten kpi → 0..1 submission rows into the RawRow shape aggregateMonthly expects.
  const rows: RawRow[] = [];
  for (const k of (data ?? []) as any[]) {
    const subs: any[] = Array.isArray(k.review_submissions)
      ? k.review_submissions
      : (k.review_submissions ? [k.review_submissions] : []);
    const kpiMeta = {
      employee_id: k.employee_id,
      review_period: k.review_period,
      review_year: k.review_year,
      weightage: k.weightage,
    };
    if (subs.length === 0) {
      // No submission yet → treat as no score; aggregateMonthly will skip it.
      rows.push({
        kpi_id: k.id, is_na: null,
        final_score: null, manager_score: null, auditor_score: null, self_score: null,
        kpis: kpiMeta,
      });
      continue;
    }
    for (const s of subs) {
      rows.push({
        kpi_id: k.id,
        is_na: s.is_na ?? null,
        final_score: s.final_score ?? null,
        manager_score: s.manager_score ?? null,
        auditor_score: s.auditor_score ?? null,
        self_score: s.self_score ?? null,
        kpis: kpiMeta,
      });
    }
  }
  return aggregateMonthly(rows, fyStart, excludeNa);
}

/** Full snapshot: fetch + aggregate + compute. */
export async function buildCarrySnapshot(
  employeeId: string,
  fyStart: number,
  cfg: CarryKraConfig,
  weight: number,
): Promise<CarryKraSnapshot> {
  const monthly = await fetchMonthlyKraScores(employeeId, fyStart, cfg.excludeNa ?? true);
  const rating = computeCarryRating(monthly, cfg);
  const value = computeCarryContribution(rating, weight);
  return {
    monthly,
    rating,
    value,
    maxValue: Math.max(0, Number(weight) || 0),
    fiscal_year: fyStart,
    config: cfg,
    computed_at: new Date().toISOString(),
  };
}
/**
 * ADR-235 / POLICY §AR-FINAL-SCORE-SINGLE-WRITER
 *
 * `annual_review_apply_final_summary` is the ONLY sanctioned writer of
 * `total_score` / `final_rating`. The 30-Jul/01-Aug bulk system-score upload
 * bypassed it (it trusted a client-supplied total under a monotonic guard), so
 * 104 completed reviews carried an understated final score while their stored
 * system scores had already been upgraded.
 *
 * These pure helpers back the admin drift monitor: they classify a row returned
 * by the `annual_review_final_score_drift` RPC and summarise a batch.
 */
export interface FinalScoreDriftRow {
  instance_id: string;
  employee_code: string | null;
  employee_name: string | null;
  stored_total: number | null;
  computed_total: number | null;
  stored_rating: string | null;
  computed_rating: string | null;
}

export type DriftKind = 'understated' | 'overstated' | 'band_only' | 'none';

/** Difference between the recomputed and the stored score (positive = understated). */
export function driftDelta(row: FinalScoreDriftRow): number {
  return Number(row.computed_total ?? 0) - Number(row.stored_total ?? 0);
}

function sameScore(row: FinalScoreDriftRow): boolean {
  const a = row.stored_total;
  const b = row.computed_total;
  if (a === null || a === undefined || b === null || b === undefined) return a === b;
  return Math.abs(Number(a) - Number(b)) < 0.005;
}

export function classifyDrift(row: FinalScoreDriftRow): DriftKind {
  if (!sameScore(row)) return driftDelta(row) > 0 ? 'understated' : 'overstated';
  if ((row.stored_rating ?? '') !== (row.computed_rating ?? '')) return 'band_only';
  return 'none';
}

/** True when the recomputation also moves the employee into another rating band. */
export function changesBand(row: FinalScoreDriftRow): boolean {
  return (row.stored_rating ?? '') !== (row.computed_rating ?? '');
}

export interface DriftSummary {
  total: number;
  understated: number;
  overstated: number;
  bandOnly: number;
  bandChanges: number;
  maxDelta: number;
}

export function summariseDrift(rows: readonly FinalScoreDriftRow[]): DriftSummary {
  const real = rows.filter((r) => classifyDrift(r) !== 'none');
  return {
    total: real.length,
    understated: real.filter((r) => classifyDrift(r) === 'understated').length,
    overstated: real.filter((r) => classifyDrift(r) === 'overstated').length,
    bandOnly: real.filter((r) => classifyDrift(r) === 'band_only').length,
    bandChanges: real.filter(changesBand).length,
    maxDelta: real.reduce((m, r) => Math.max(m, Math.abs(driftDelta(r))), 0),
  };
}

export const DRIFT_RECOMPUTE_REASON =
  'ADR-235 admin monitor: recompute stored final score from the sanctioned SSOT';

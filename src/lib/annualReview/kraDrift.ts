/**
 * ADR-233 / POLICY §AR-KRA-REHYDRATE.
 *
 * Pure helpers for "is the stored Carry-KRA snapshot still in sync with the
 * latest monthly KPI data?". Annual review system scores are a frozen
 * snapshot (POLICY §88), so drift is expected and must be surfaced rather
 * than silently recomputed.
 */

/** Rounding used by the DB-side rehydrate RPC — keep both sides identical. */
export function round2(n: number): number {
  return Math.round(Number(n) * 100) / 100;
}

/**
 * True when the stored snapshot value differs from the freshly computed one.
 * A missing stored value with a computed value present counts as drift; a
 * missing/invalid computed value never does (nothing to sync to).
 */
export function isCarryValueDrifted(
  stored: number | null | undefined,
  computed: number | null | undefined,
): boolean {
  if (computed == null || !Number.isFinite(Number(computed))) return false;
  if (stored == null || !Number.isFinite(Number(stored))) return true;
  return round2(Number(stored)) !== round2(Number(computed));
}

export interface KraDriftSummary {
  cycle_id: string;
  kra_instances: number;
  in_flight: number;
  drifted: number;
  last_applied_at: string | null;
  last_applied_run_id: string | null;
  computed_at: string;
}

/** Short human sentence for the admin drift indicator. */
export function describeDrift(s: KraDriftSummary | null | undefined): string {
  if (!s) return 'Drift not measured yet.';
  if (s.kra_instances === 0) return 'No KRA-based reviews in this cycle.';
  if (s.drifted === 0) return `All ${s.kra_instances} KRA-based reviews are in sync with monthly KPI data.`;
  return `${s.drifted} of ${s.kra_instances} KRA-based reviews differ from the latest monthly KPI data.`;
}
/**
 * ADR-232 / POLICY §AR-FINAL-SCORE-WRITE-BACK.
 *
 * A completed (non-excluded) Annual Review instance must carry a stored
 * `total_score`. Repair/auto-finalise paths historically marked instances
 * `completed` without invoking `annual_review_compute_final_summary`, leaving
 * the final score — and therefore Final Rating (/5), Slab % and the rating
 * band — blank in every report.
 *
 * This service is the client-side surface for:
 *   1. detecting completed instances with no stored final score, and
 *   2. asking the server to recompute them (admin / hr_pms only, audited).
 *
 * No scoring maths lives here — the server RPC reuses the existing SSOT.
 */
import { supabase } from '@/integrations/supabase/client';

export interface MissingFinalScoreRow {
  instance_id: string;
  employee_code: string | null;
  employee_name: string | null;
}

export interface RecomputeResult {
  applied: number;
  skipped: { instance_id: string; reason: string }[];
}

/** Rows in a report payload that are completed but hold no final score. */
export function missingFinalScoreRows<
  T extends {
    instance_id: string;
    overall_status?: string | null;
    is_excluded?: boolean | null;
    total_score?: number | null;
    employee_code?: string | null;
    employee_name?: string | null;
  },
>(rows: readonly T[] | null | undefined): MissingFinalScoreRow[] {
  return (rows ?? [])
    .filter(
      (r) =>
        r.overall_status === 'completed' &&
        !r.is_excluded &&
        (r.total_score === null || r.total_score === undefined),
    )
    .map((r) => ({
      instance_id: r.instance_id,
      employee_code: r.employee_code ?? null,
      employee_name: r.employee_name ?? null,
    }));
}

/** True when a single row's blank rating is caused by a missing final score. */
export function isMissingFinalScore(row: {
  overall_status?: string | null;
  is_excluded?: boolean | null;
  total_score?: number | null;
}): boolean {
  return (
    row.overall_status === 'completed' &&
    !row.is_excluded &&
    (row.total_score === null || row.total_score === undefined)
  );
}

export const RECOMPUTE_REASON_MIN_LENGTH = 10;
export const RECOMPUTE_BATCH_LIMIT = 1000;

/**
 * Recompute + persist the final score for the given instances.
 * `allowOverwrite` is admin-only server-side and must stay off for repairs:
 * it is the guard that stops an already-finalised score being rewritten.
 */
export async function recomputeFinalScores(args: {
  instanceIds: string[];
  reason: string;
  allowOverwrite?: boolean;
}): Promise<RecomputeResult> {
  const ids = Array.from(new Set(args.instanceIds.filter(Boolean)));
  if (!ids.length) return { applied: 0, skipped: [] };
  if (ids.length > RECOMPUTE_BATCH_LIMIT) {
    throw new Error(`Too many reviews selected (max ${RECOMPUTE_BATCH_LIMIT}).`);
  }
  if (args.reason.trim().length < RECOMPUTE_REASON_MIN_LENGTH) {
    throw new Error(`A reason of at least ${RECOMPUTE_REASON_MIN_LENGTH} characters is required.`);
  }

  const { data, error } = await supabase.rpc('admin_recompute_annual_review_final_score', {
    p_instance_ids: ids,
    p_reason: args.reason.trim(),
    p_allow_overwrite: args.allowOverwrite ?? false,
  } as never);

  if (error) throw error;

  const payload = (data ?? {}) as { applied?: number; skipped?: unknown };
  return {
    applied: Number(payload.applied ?? 0),
    skipped: Array.isArray(payload.skipped)
      ? (payload.skipped as { instance_id: string; reason: string }[])
      : [],
  };
}
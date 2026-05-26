export const BULK_REMARK_MIN_LENGTH = 10;

export interface RemarkValidationResult {
  ok: boolean;
  trimmed: string;
  reason?: 'empty' | 'too_short';
}

/**
 * Mirrors server contract in `bulk_write_stage_scores` (p_batch_reason
 * must be non-null, trimmed length >= 10). Pure helper so it can be
 * unit-tested without rendering the drawer.
 */
export function validateBulkRemark(remarks: string): RemarkValidationResult {
  const trimmed = (remarks ?? '').trim();
  if (trimmed.length === 0) return { ok: false, trimmed, reason: 'empty' };
  if (trimmed.length < BULK_REMARK_MIN_LENGTH) return { ok: false, trimmed, reason: 'too_short' };
  return { ok: true, trimmed };
}
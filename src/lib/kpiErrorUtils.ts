/**
 * Centralized duplicate KPI error detection and friendly messaging.
 * Used across all KPI creation/assignment paths.
 */

/**
 * Detect if a Supabase/Postgres error is a duplicate KPI constraint violation.
 */
export function isDuplicateKpiError(error: any): boolean {
  if (!error) return false;
  // PostgREST returns code '23505' for unique constraint violations
  if (error.code === '23505') return true;
  const msg = error.message || '';
  return msg.includes('idx_kpis_no_duplicates') || msg.includes('duplicate key');
}

/**
 * Build a user-friendly duplicate KPI error message.
 * Includes the resolved effective month when it differs from the selected month.
 */
export function getDuplicateKpiMessage(opts?: {
  frequency?: string | null;
  selectedMonth?: string;
  resolvedMonth?: string;
  selectedYear?: number;
}): string {
  const base = 'This KRA/KPI is already assigned to this employee';

  if (opts?.resolvedMonth && opts?.selectedMonth && opts.resolvedMonth !== opts.selectedMonth) {
    return `${base} for ${opts.resolvedMonth} ${opts.selectedYear || ''} (effective month for the selected ${opts.frequency || ''} cycle). Please choose a different KPI or period.`.replace(/\s+/g, ' ').trim();
  }

  if (opts?.resolvedMonth) {
    return `${base} for ${opts.resolvedMonth} ${opts.selectedYear || ''}. Please choose a different KPI or period.`.replace(/\s+/g, ' ').trim();
  }

  return `${base} for the selected review period. Please choose a different KPI or period.`;
}

/**
 * Format duplicate KPI error description from a caught error.
 * Use in onError handlers across all assignment dialogs.
 */
export function formatKpiInsertError(error: any, opts?: {
  frequency?: string | null;
  selectedMonth?: string;
  resolvedMonth?: string;
  selectedYear?: number;
}): string {
  if (isDuplicateKpiError(error)) {
    return getDuplicateKpiMessage(opts);
  }
  return error?.message || 'An unexpected error occurred';
}

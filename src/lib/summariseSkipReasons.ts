/**
 * Group bulk-write skip results into a human-readable toast description.
 *
 * POLICY §111.7 — Bulk Stage Sign-off must surface *why* cells were skipped
 * (self_not_submitted, final_locked, no_prior_score, etc.) directly in the
 * toast so reviewers don't have to dig through the audit log for a one-line
 * answer. Falls back to "see audit log" when there are too many distinct
 * reasons to fit in a toast.
 */
export interface SkipEntry {
  submission_id: string;
  reason: string;
}

const REASON_LABEL: Record<string, string> = {
  not_found: 'submission missing',
  final_locked: 'already final',
  self_not_submitted: 'self not submitted',
  auditor_takes_precedence: 'auditor already scored',
  row_version_conflict: 'changed by another user',
  no_prior_score: 'no prior score to inherit',
};

function label(reason: string): string {
  return REASON_LABEL[reason] ?? reason;
}

export function summariseSkipReasons(skipped: SkipEntry[]): string | null {
  if (!skipped || skipped.length === 0) return null;
  const counts = new Map<string, number>();
  for (const s of skipped) {
    counts.set(s.reason, (counts.get(s.reason) ?? 0) + 1);
  }
  if (counts.size >= 3) {
    return `${skipped.length} skipped — see audit log`;
  }
  const parts = Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([reason, n]) => `${label(reason)} (${n})`);
  return `${skipped.length} skipped: ${parts.join(', ')}`;
}
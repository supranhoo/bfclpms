/**
 * ADR-264 — BU Console group previews: no silent truncation.
 *
 * The RPCs report the TRUE affected/skipped counts plus a reason breakdown,
 * but cap the per-employee detail arrays. These helpers are the single place
 * that decides what the dialog shows, so the UI can never imply that the
 * detail list is the whole story.
 */

export interface SkipSummaryEntry {
  reason: string;
  count: number;
}

interface PreviewLike {
  will_write?: number;
  will_advance?: number;
  will_skip?: number;
  detail_limit?: number;
  detail_truncated?: boolean;
  skip_summary?: SkipSummaryEntry[];
  preview?: unknown[];
  skipped_details?: { reason: string }[];
}

/** Above this many affected employees a group action needs a typed confirmation. */
export const GROUP_ACTION_CONFIRM_THRESHOLD = 2000;

/** The word the admin must type to confirm a very large group action. */
export const GROUP_ACTION_CONFIRM_WORD = 'APPLY';

/**
 * Reason breakdown for the summary badges. Prefers the server summary (which
 * covers every skipped row) and only falls back to counting the capped detail
 * list when an older response has no summary.
 */
export function resolveSkipSummary(res: PreviewLike | null | undefined): SkipSummaryEntry[] {
  if (!res) return [];
  if (res.skip_summary?.length) {
    return [...res.skip_summary].sort((a, b) => b.count - a.count);
  }
  const map = new Map<string, number>();
  (res.skipped_details ?? []).forEach(r => map.set(r.reason, (map.get(r.reason) ?? 0) + 1));
  return Array.from(map.entries())
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count);
}

/** Total employees a commit would touch (never the length of the capped list). */
export function affectedCount(res: PreviewLike | null | undefined): number {
  if (!res) return 0;
  return res.will_write ?? res.will_advance ?? 0;
}

export interface TruncationNote {
  truncated: boolean;
  shown: number;
  total: number;
  /** Null when nothing was cut. */
  message: string | null;
}

function note(shown: number, total: number, noun: string): TruncationNote {
  const truncated = total > shown;
  return {
    truncated,
    shown,
    total,
    message: truncated
      ? `Showing the first ${shown} of ${total} ${noun}. The counts above cover all of them, and saving applies to every one.`
      : null,
  };
}

/** Note for the affected-employee detail table. */
export function previewTruncation(res: PreviewLike | null | undefined): TruncationNote {
  if (!res) return { truncated: false, shown: 0, total: 0, message: null };
  return note((res.preview ?? []).length, affectedCount(res), 'affected employees');
}

/** Note for the skipped-employee list. */
export function skippedTruncation(res: PreviewLike | null | undefined): TruncationNote {
  if (!res) return { truncated: false, shown: 0, total: 0, message: null };
  return note((res.skipped_details ?? []).length, res.will_skip ?? (res.skipped_details ?? []).length, 'skipped employees');
}

/** Very large scopes must be confirmed explicitly before they commit. */
export function needsTypedConfirmation(res: PreviewLike | null | undefined): boolean {
  return affectedCount(res) > GROUP_ACTION_CONFIRM_THRESHOLD;
}

export function confirmationSatisfied(res: PreviewLike | null | undefined, typed: string): boolean {
  if (!needsTypedConfirmation(res)) return true;
  return typed.trim().toUpperCase() === GROUP_ACTION_CONFIRM_WORD;
}

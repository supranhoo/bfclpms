/**
 * ADR-238 / POLICY §AR-ADMIN-FINAL-OUTCOME-VISIBILITY
 *
 * Pure presentation helpers for the per-instance annual review change log.
 * Data access lives in `useAnnualReviewInstanceChangeLog`; the card is a
 * rendering surface only. Keeping the labelling here makes it unit-testable
 * and keeps it aligned with the Master Change History report (ADR-213).
 */

export type ChangeLogEventType =
  | 'calibration'
  | 'final_score'
  | 'system_score'
  | 'exemption'
  | 'stage'
  | string;

export interface InstanceChangeLogRow {
  occurred_at: string;
  event_type: ChangeLogEventType;
  field_label: string;
  old_value: string | null;
  new_value: string | null;
  actor_id: string | null;
  actor_name: string | null;
  reason: string | null;
  total_count: number;
}

export const EVENT_TYPE_LABEL: Record<string, string> = {
  calibration: 'Calibration',
  final_score: 'Final score',
  system_score: 'System score',
  exemption: 'Exemption',
  stage: 'Stage',
};

export function eventTypeLabel(type: ChangeLogEventType): string {
  return EVENT_TYPE_LABEL[type] ?? 'Change';
}

/**
 * Automated rows carry no performer (POLICY: automated actions set
 * `performed_by = NULL`), so they must read as "System", never blank.
 */
export function actorLabel(row: Pick<InstanceChangeLogRow, 'actor_id' | 'actor_name'>): string {
  if (!row.actor_id) return 'System';
  return row.actor_name?.trim() || 'Unknown user';
}

/** `12.00 -> 14.00`, `-> approved`, or `—` when neither side is present. */
export function formatChange(
  row: Pick<InstanceChangeLogRow, 'old_value' | 'new_value'>,
): string {
  const from = row.old_value?.trim() || null;
  const to = row.new_value?.trim() || null;
  if (from && to) return `${from} → ${to}`;
  if (to) return to;
  if (from) return `${from} → —`;
  return '—';
}

/** Newest first; ties broken by label so the order is deterministic. */
export function sortChangeLog(
  rows: readonly InstanceChangeLogRow[],
): InstanceChangeLogRow[] {
  return rows.slice().sort((a, b) => {
    const d = new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime();
    return d !== 0 ? d : a.field_label.localeCompare(b.field_label);
  });
}

/** Locale timestamp used by the timeline rows. */
export function formatChangeTimestamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

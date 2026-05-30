/**
 * Phase 9 — Pure offline-queue error classifier.
 * ----------------------------------------------
 * Maps a queue entry's `last_error` (free text from the existing
 * `recordPendingFailure` engine) into a stable UI class so the Offline
 * Inspector can render distinct badges WITHOUT changing the queue contract.
 *
 * No imports, no side effects, no I/O — safe to import anywhere.
 */

export type QueueErrorClass =
  | 'none'        // never attempted yet
  | 'network'     // offline / DNS / fetch failure
  | 'conflict'    // server says it already accepted this client_submission_id
  | 'server'      // 5xx / RLS / validation
  | 'unknown';    // we couldn't categorise

export interface QueueErrorMeta {
  cls: QueueErrorClass;
  label: string;
  /** Hint copy for the inspector tooltip / row body. */
  hint: string;
}

const NETWORK_HINTS = [
  /network/i,
  /failed to fetch/i,
  /typeerror.*fetch/i,
  /load failed/i,
  /offline/i,
  /timeout/i,
  /ENOTFOUND/i,
  /ECONN/i,
  /\b(?:50[234])\b/,         // 502/503/504 gateway errors are network-class
  /aborted/i,
];

const CONFLICT_HINTS = [
  /duplicate key/i,
  /unique constraint/i,
  /already exists/i,
  /client_submission_id/i,
  /\b409\b/,
  /conflict/i,
];

const SERVER_HINTS = [
  /\b(?:4\d{2}|5\d{2})\b/,   // anything else in 4xx / 5xx
  /violates row[- ]level security/i,
  /permission denied/i,
  /policy/i,
  /violates check constraint/i,
  /null value in column/i,
];

/** Classify a single queue entry. */
export function classifyQueueError(
  lastError: string | null | undefined,
  attempts: number,
): QueueErrorMeta {
  if (!lastError || attempts === 0) {
    return { cls: 'none', label: 'Queued', hint: 'Waiting to send.' };
  }
  const e = String(lastError);
  if (CONFLICT_HINTS.some((re) => re.test(e))) {
    return {
      cls: 'conflict',
      label: 'Already received',
      hint: 'The server already accepted a submission with the same idempotency key. Discard this entry — it is safe.',
    };
  }
  if (NETWORK_HINTS.some((re) => re.test(e))) {
    return {
      cls: 'network',
      label: 'Network issue',
      hint: 'Couldn\u2019t reach the server. The queue will retry automatically when you reconnect.',
    };
  }
  if (SERVER_HINTS.some((re) => re.test(e))) {
    return {
      cls: 'server',
      label: 'Rejected',
      hint: 'The server rejected this submission. Editing isn\u2019t supported \u2014 discard and re-report.',
    };
  }
  return {
    cls: 'unknown',
    label: 'Failed',
    hint: 'An unexpected error occurred. Retry, or discard and re-report.',
  };
}

/** Map attempts count to a severity bucket for badge tinting. */
export type AttemptSeverity = 'fresh' | 'warning' | 'critical';
export function attemptSeverity(attempts: number): AttemptSeverity {
  if (attempts >= 6) return 'critical';
  if (attempts >= 3) return 'warning';
  return 'fresh';
}
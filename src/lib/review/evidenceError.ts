/**
 * ADR-190 / POLICY §EVIDENCE-READ-KPI-PARTICIPATION.
 *
 * Supabase Storage denials on a private bucket surface as an error object with
 * an empty body, which previously rendered as "Preview failed: {}". Normalise
 * any thrown value into a message a reviewer or employee can act on.
 */
const ACCESS_DENIED =
  'You do not have access to this file, or it is no longer available.';

/**
 * ADR-250. Transient failures (statement timeout, storage 544, 5xx, aborted
 * fetch, offline) were previously collapsed into ACCESS_DENIED, which told
 * reviewers they lacked permission when the real cause was a busy backend.
 */
const SERVER_BUSY =
  'The file server is busy right now — please retry in a moment.';

export function isTransientEvidenceError(err: unknown): boolean {
  if (err == null) return false;

  const anyErr = err as { name?: unknown; message?: unknown; error?: unknown; statusCode?: unknown };
  const code = String(anyErr?.statusCode ?? '');
  if (/^5\d\d$/.test(code) || code === '544' || code === '408' || code === '429') return true;

  const text = (
    typeof err === 'string'
      ? err
      : [anyErr?.name, anyErr?.message, anyErr?.error].filter((v) => typeof v === 'string').join(' ')
  ).toLowerCase();

  if (!text) return false;
  return (
    text.includes('timed out') ||
    text.includes('timeout') ||
    text.includes('aborterror') ||
    text.includes('aborted') ||
    text.includes('failed to fetch') ||
    text.includes('networkerror') ||
    text.includes('network error') ||
    text.includes('connection') ||
    text.includes('canceling statement') ||
    text.includes('too many requests') ||
    text.includes('service unavailable') ||
    text.includes('bad gateway') ||
    text.includes('gateway timeout') ||
    text.includes('57014')
  );
}

export function normalizeEvidenceError(err: unknown, fallback = ACCESS_DENIED): string {
  // Transient backend pressure must never be reported as a permission problem.
  if (isTransientEvidenceError(err)) return SERVER_BUSY;

  if (typeof err === 'string') return err.trim() || fallback;

  if (err && typeof err === 'object') {
    const anyErr = err as { message?: unknown; error?: unknown; statusCode?: unknown };
    const raw =
      typeof anyErr.message === 'string'
        ? anyErr.message
        : typeof anyErr.error === 'string'
          ? anyErr.error
          : '';
    const message = raw.trim();
    if (!message || message === '{}' || message === '[object Object]') return fallback;

    const code = String(anyErr.statusCode ?? '');
    if (/not\s*found/i.test(message) || code === '404' || code === '400') {
      return ACCESS_DENIED;
    }
    if (/unauthor|forbidden|row-level security|permission/i.test(message) || code === '403') {
      return ACCESS_DENIED;
    }
    return message;
  }

  return fallback;
}

export const EVIDENCE_ACCESS_DENIED_MESSAGE = ACCESS_DENIED;
export const EVIDENCE_SERVER_BUSY_MESSAGE = SERVER_BUSY;
